package httpapi

import (
	"encoding/json"
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
	Clock    func() time.Time
}

func New(options Options) *gin.Engine {
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
	send := func(c *gin.Context, status int, f domain.Fact) {
		if status == 201 {
			c.Header("Location", f.Href)
		}
		c.Header("Content-Type", "application/hal+json")
		c.JSON(status, domain.Representation(f))
	}
	for lane, def := range domain.Definitions {
		lane, def := lane, def
		root := "/" + lane + "/" + def.Name
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
			base := root + "/:contractId/" + action
			app.GET(base, func(c *gin.Context) {
				authorize(c, lane, []string{roles[0]})
				ledger.Get(c.Param("contractId"), "contract."+def.Name)
				send(c, 200, ledger.Find(c.Param("contractId"), "request."+action))
			})
			app.POST(base+"/request", func(c *gin.Context) {
				authorize(c, lane, []string{roles[0]})
				send(c, 201, ledger.Request(lane, action, c.Param("contractId"), read(c), c.MustGet("now").(time.Time)))
			})
			app.POST(base+"/request/:requestId/confirmation", func(c *gin.Context) {
				authorize(c, lane, []string{roles[1]})
				send(c, 201, ledger.Confirm(lane, action, c.Param("contractId"), c.Param("requestId"), read(c), c.MustGet("now").(time.Time)))
			})
		}
	}
	return app
}
