package httpapi

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"example.com/escrow/internal/domain"
	"github.com/gin-gonic/gin"
)

type Options struct {
	TestMode bool
	Mode     string
	Fault    string
	Clock    func() time.Time
}

type HalLink struct {
	Href string `json:"href"`
}

type HalCollection struct {
	Links    map[string]HalLink       `json:"_links"`
	Embedded map[string][]domain.Data `json:"_embedded"`
	Total    int                      `json:"total"`
}

func ValidFault(fault string) bool {
	switch fault {
	case "", "none", "accept-derived", "extra-field", "clock", "precision":
		return true
	}
	return false
}

func New(options Options) *gin.Engine {
	if !ValidFault(options.Fault) {
		panic("Unknown fault")
	}
	gin.SetMode(gin.ReleaseMode)
	app := gin.New()
	ledger := domain.NewLedger()
	clock := options.Clock
	if clock == nil {
		clock = func() time.Time { return time.Now().UTC().Truncate(time.Second) }
	}
	app.Use(func(c *gin.Context) {
		defer func() {
			if recovered := recover(); recovered != nil {
				if e, ok := recovered.(*domain.Error); ok {
					c.AbortWithStatusJSON(e.Status, gin.H{"error": e.Code, "detail": e.Detail})
				} else {
					c.AbortWithStatusJSON(500, gin.H{"error": "INTERNAL_ERROR"})
				}
			}
		}()
		if !options.TestMode {
			c.AbortWithStatusJSON(503, gin.H{"error": "TEST_MODE_REQUIRED"})
			return
		}
		now := clock()
		if values, exists := c.Request.Header["X-Evidence-Asof"]; exists {
			if len(values) != 1 {
				c.AbortWithStatusJSON(400, gin.H{"error": "INVALID_CLOCK"})
				return
			}
			parsed, err := domain.ParseTime(values[0])
			if err != nil {
				c.AbortWithStatusJSON(400, gin.H{"error": "INVALID_CLOCK"})
				return
			}
			now = parsed
		}
		if options.Fault == "clock" {
			now = clock() // Test-only bug: discard the valid request-scoped clock.
		}
		roles := c.Request.Header.Values("X-Evidence-Role")
		if len(roles) != 1 || roles[0] == "" {
			c.AbortWithStatusJSON(401, gin.H{"error": "UNAUTHENTICATED"})
			return
		}
		c.Set("now", now)
		c.Set("role", roles[0])
		c.Next()
	})
	authorize := func(c *gin.Context, lane string, allowed []string) {
		role := c.GetString("role")
		for _, r := range allowed {
			if role == "role."+lane+"-"+r {
				return
			}
		}
		panic(&domain.Error{Status: 403, Code: "FORBIDDEN", Detail: "Role cannot perform operation"})
	}
	read := func(c *gin.Context) domain.Data {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 65536)
		decoder := json.NewDecoder(c.Request.Body)
		decoder.UseNumber()
		var data domain.Data
		if err := decoder.Decode(&data); err != nil || data == nil {
			panic(&domain.Error{Status: 422, Code: "INVALID_INPUT", Detail: "Expected JSON object"})
		}
		if err := decoder.Decode(new(any)); err != io.EOF {
			panic(&domain.Error{Status: 422, Code: "INVALID_INPUT", Detail: "Trailing JSON"})
		}
		return data
	}
	representation := func(f domain.Fact) domain.Data {
		data := domain.Representation(f)
		if options.Fault == "extra-field" {
			data["unmodeled"] = true
		}
		if options.Fault == "precision" {
			// Deliberately simulate a lossy JSON/float64 boundary, not a new oracle.
			for key, value := range f.Data {
				if n, ok := value.(int64); ok {
					rounded := int64(float64(n))
					if rounded > domain.MaxSafe || rounded < -domain.MaxSafe {
						data[key] = fmt.Sprint(rounded)
					} else {
						data[key] = rounded
					}
				}
			}
		}
		return data
	}
	send := func(c *gin.Context, status int, f domain.Fact) {
		if status == 201 {
			c.Header("Location", f.Href)
		}
		c.Header("Content-Type", "application/hal+json")
		c.JSON(status, representation(f))
	}
	collection := func(c *gin.Context, href, name string, facts []domain.Fact) {
		items := make([]domain.Data, 0, len(facts))
		for _, fact := range facts {
			items = append(items, representation(fact))
		}
		c.Header("Content-Type", "application/hal+json")
		c.JSON(200, HalCollection{
			Links:    map[string]HalLink{"self": {Href: href}},
			Embedded: map[string][]domain.Data{name: items},
			Total:    len(items),
		})
	}
	for lane, def := range domain.Definitions {
		lane, def := lane, def
		root := "/" + domain.CollectionOf(def.Name)
		app.GET(root, func(c *gin.Context) {
			authorize(c, lane, def.Roles)
			collection(c, root, domain.CollectionOf(def.Name), ledger.List("contract."+def.Name, ""))
		})
		app.POST(root, func(c *gin.Context) {
			authorize(c, lane, def.Roles)
			send(c, 201, ledger.Sign(lane, read(c), c.MustGet("now").(time.Time)))
		})
		app.GET(root+"/:contractId", func(c *gin.Context) {
			authorize(c, lane, def.Roles)
			send(c, 200, ledger.Get(c.Param("contractId"), "contract."+def.Name))
		})
		for action, roles := range def.Actions {
			action, roles := action, roles
			if options.Mode == "v1" && strings.Contains(action, "milestone") {
				continue
			}
			base := root + "/:contractId/" + domain.CollectionOf(action)
			requestFact := func(c *gin.Context) domain.Fact {
				ledger.Get(c.Param("contractId"), "contract."+def.Name)
				fact := ledger.Get(c.Param("requestId"), "request."+action)
				if fact.ContractID != c.Param("contractId") {
					panic(&domain.Error{Status: 404, Code: "NOT_FOUND", Detail: "Request belongs to another contract"})
				}
				return fact
			}
			app.GET(base, func(c *gin.Context) {
				authorize(c, lane, []string{roles[0]})
				contract := ledger.Get(c.Param("contractId"), "contract."+def.Name)
				collection(c, contract.Href+"/"+domain.CollectionOf(action), domain.CollectionOf(action), ledger.List("request."+action, contract.ID))
			})
			app.GET(base+"/:requestId", func(c *gin.Context) {
				authorize(c, lane, []string{roles[0]})
				send(c, 200, requestFact(c))
			})
			app.GET("/"+action+"-confirmations/:confirmationId", func(c *gin.Context) {
				authorize(c, lane, []string{roles[1]})
				send(c, 200, ledger.Get(c.Param("confirmationId"), "confirmation."+action))
			})
			app.POST(base, func(c *gin.Context) {
				authorize(c, lane, []string{roles[0]})
				send(c, 201, ledger.Request(lane, action, c.Param("contractId"), read(c), c.MustGet("now").(time.Time)))
			})
			app.POST(base+"/:requestId/confirmation", func(c *gin.Context) {
				authorize(c, lane, []string{roles[1]})
				input := read(c)
				if _, supplied := input["payout_minor"]; options.Fault == "accept-derived" && supplied && (action == "release" || action == "milestone-release") {
					// Test-only bug: trust caller data without committing a confirmation.
					c.JSON(201, input)
					return
				}
				send(c, 201, ledger.Confirm(lane, action, c.Param("contractId"), c.Param("requestId"), input, c.MustGet("now").(time.Time)))
			})
		}
	}
	return app
}
