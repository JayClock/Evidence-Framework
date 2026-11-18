package httpapi

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"sync"
	"testing"
	"time"

	"example.com/escrow/internal/domain"
)

const when = "2026-06-01T00:00:00Z"

func terms(id string) domain.Data {
	return domain.Data{"id": id, "quantity": 2, "tier_threshold": 1000, "tier1_unit_price_minor": "10000000000000001", "tier2_unit_price_minor": 1199, "tax_bps": 1300, "retention_bps": 500, "daily_penalty_bps": 100, "delivery_deadline": when}
}
func call(app http.Handler, method, path, role, clock string, body any) *httptest.ResponseRecorder {
	data, _ := json.Marshal(body)
	r := httptest.NewRequest(method, path, bytes.NewReader(data))
	r.Header.Set("Content-Type", "application/json")
	if role != "" {
		r.Header.Set("x-evidence-role", role)
	}
	if clock != "" {
		r.Header.Set("x-evidence-asof", clock)
	}
	w := httptest.NewRecorder()
	app.ServeHTTP(w, r)
	return w
}
func must(t *testing.T, app http.Handler, path, role string, body any) domain.Data {
	t.Helper()
	r := call(app, "POST", path, role, when, body)
	if r.Code != 201 {
		t.Fatalf("%s: %d %s", path, r.Code, r.Body)
	}
	var d domain.Data
	if err := json.Unmarshal(r.Body.Bytes(), &d); err != nil {
		t.Fatal(err)
	}
	location := r.Header().Get("Location")
	if r.Header().Get("Content-Type") != "application/hal+json" || location == "" || d["_links"].(map[string]any)["self"].(map[string]any)["href"] != location {
		t.Fatal(r.Header(), d)
	}
	if read := getData(t, app, location, role); !reflect.DeepEqual(read, d) {
		t.Fatal("primary GET differs from created evidence", read, d)
	}
	return d
}

func getData(t *testing.T, app http.Handler, path, role string) domain.Data {
	t.Helper()
	r := call(app, "GET", path, role, when, nil)
	if r.Code != 200 || r.Header().Get("Content-Type") != "application/hal+json" || r.Header().Get("Location") != "" {
		t.Fatalf("GET %s: %d %s %s", path, r.Code, r.Header(), r.Body)
	}
	var d domain.Data
	if err := json.Unmarshal(r.Body.Bytes(), &d); err != nil {
		t.Fatal(err)
	}
	return d
}

func TestHALCollectionsAndScopedPrimaryReads(t *testing.T) {
	app := New(Options{TestMode: true})
	for _, test := range []struct{ collection, role string }{
		{"agreements", "role.procurement-buyer"},
		{"escrows", "role.escrow-buyer"},
		{"fulfillments", "role.fulfillment-seller"},
		{"settlements", "role.settlement-escrow"},
	} {
		d := getData(t, app, "/"+test.collection, test.role)
		want := domain.Data{"_links": map[string]any{"self": map[string]any{"href": "/" + test.collection}}, "_embedded": map[string]any{test.collection: []any{}}, "total": float64(0)}
		if !reflect.DeepEqual(d, want) {
			t.Fatal(d, want)
		}
	}
	buyer, seller := "role.procurement-buyer", "role.procurement-seller"
	must(t, app, "/agreements", buyer, terms("a b"))
	must(t, app, "/agreements", buyer, terms("b"))
	contracts := getData(t, app, "/agreements", buyer)
	if contracts["total"] != float64(2) || len(contracts["_embedded"].(map[string]any)["agreements"].([]any)) != 2 {
		t.Fatal(contracts)
	}
	path := "/agreements/a%20b/orders"
	empty := getData(t, app, path, buyer)
	if empty["total"] != float64(0) || len(empty["_embedded"].(map[string]any)["orders"].([]any)) != 0 {
		t.Fatal(empty)
	}
	req := must(t, app, path, buyer, domain.Data{"id": "req"})
	listed := getData(t, app, path, buyer)
	items := listed["_embedded"].(map[string]any)["orders"].([]any)
	if listed["total"] != float64(1) || len(items) != 1 || !reflect.DeepEqual(items[0], map[string]any(req)) || listed["_links"].(map[string]any)["self"].(map[string]any)["href"] != path {
		t.Fatal(listed)
	}
	if d := getData(t, app, "/agreements/b/orders", buyer); d["total"] != float64(0) {
		t.Fatal(d)
	}
	confirmation := "/order-confirmations/confirmed"
	if r := call(app, "GET", confirmation, seller, when, nil); r.Code != 404 {
		t.Fatal(r.Code, r.Body)
	}
	confirmed := must(t, app, path+"/req/confirmation", seller, domain.Data{"id": "confirmed"})
	if confirmed["_links"].(map[string]any)["self"].(map[string]any)["href"] != confirmation || !reflect.DeepEqual(getData(t, app, confirmation, seller), confirmed) {
		t.Fatal(confirmed)
	}
	for _, test := range []struct {
		path, role string
		status     int
	}{
		{"/agreements/b/orders/req", buyer, 404},
		{"/agreements/a%20b/commitments/req", seller, 404},
		{"/commitment-confirmations/confirmed", buyer, 404},
		{"/agreements/missing/orders", buyer, 404},
		{"/escrows/a%20b", "role.escrow-buyer", 404},
		{path + "/req", seller, 403},
		{confirmation, buyer, 403},
		{"/agreements", "role.escrow-buyer", 403},
	} {
		if r := call(app, "GET", test.path, test.role, when, nil); r.Code != test.status {
			t.Fatal(test.path, r.Code, r.Body)
		}
	}
}
func setupOrder(t *testing.T, app http.Handler, id string) {
	t.Helper()
	root := "/agreements/" + id
	must(t, app, "/agreements", "role.procurement-buyer", terms(id))
	must(t, app, root+"/orders", "role.procurement-buyer", domain.Data{"id": id + "-request"})
	must(t, app, root+"/orders/"+id+"-request/confirmation", "role.procurement-seller", domain.Data{"id": id + "-order"})
	must(t, app, root+"/commitments", "role.procurement-seller", domain.Data{"id": id + "-commit"})
	must(t, app, root+"/commitments/"+id+"-commit/confirmation", "role.procurement-buyer", domain.Data{"id": id + "-committed", "acknowledged": true})
}
func TestSecurityStrictInputsAndGet(t *testing.T) {
	app := New(Options{TestMode: true})
	for _, test := range []struct {
		role, clock string
		status      int
	}{{"", when, 401}, {"role.procurement-buyer", "bad", 400}, {"role.procurement-buyer", "2026-02-30T00:00:00Z", 400}, {"role.procurement-escrow", when, 403}} {
		r := call(app, "POST", "/agreements", test.role, test.clock, terms("x"))
		if r.Code != test.status {
			t.Fatal(r.Code, r.Body)
		}
	}
	r := call(New(Options{}), "POST", "/agreements", "role.procurement-buyer", when, terms("x"))
	if r.Code != 503 {
		t.Fatal(r.Code)
	}
	bad := terms("bad")
	bad["signed_at"] = when
	if call(app, "POST", "/agreements", "role.procurement-buyer", when, bad).Code != 422 {
		t.Fatal("accepted server stamp")
	}
	for _, v := range []any{true, 9007199254740992.0, "9223372036854775808", 0} {
		bad = terms("bad")
		bad["quantity"] = v
		if call(app, "POST", "/agreements", "role.procurement-buyer", when, bad).Code != 422 {
			t.Fatal("accepted invalid integer", v)
		}
	}
	must(t, app, "/agreements", "role.procurement-buyer", terms("x"))
	r = call(app, "GET", "/agreements/x", "role.procurement-seller", when, nil)
	if r.Code != 200 || r.Header().Get("Content-Type") != "application/hal+json" {
		t.Fatal(r.Code, r.Header())
	}
	if call(app, "POST", "/agreements", "role.procurement-buyer", when, terms("x")).Code != 409 {
		t.Fatal("duplicate ID")
	}
	if call(app, "POST", "/agreements/x/orders", "role.procurement-buyer", "2026-05-31T00:00:00Z", domain.Data{"id": "early"}).Code != 422 {
		t.Fatal("backdated request")
	}
}
func TestRequestClockIsolation(t *testing.T) {
	app := New(Options{TestMode: true})
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			clock := fmt.Sprintf("2026-06-01T00:00:%02dZ", i)
			r := call(app, "POST", "/agreements", "role.procurement-buyer", clock, terms(fmt.Sprint(i)))
			var d domain.Data
			_ = json.Unmarshal(r.Body.Bytes(), &d)
			if r.Code != 201 || d["signed_at"] != clock {
				t.Error(r.Code, d)
			}
		}(i)
	}
	wg.Wait()
}
func TestFullJourneyAndAtomicRelease(t *testing.T) {
	app := New(Options{TestMode: true})
	setupOrder(t, app, "a")
	setupOrder(t, app, "b")
	// Build two distinct deposits; a fulfillment contract cannot mix orders.
	for _, id := range []string{"a", "b"} {
		root := "/escrows/" + id + "-escrow"
		must(t, app, "/escrows", "role.escrow-buyer", domain.Data{"id": id + "-escrow", "order_confirmation_id": id + "-order"})
		must(t, app, root+"/deposit-locks", "role.escrow-buyer", domain.Data{"id": id + "-lock"})
		must(t, app, root+"/deposit-locks/"+id+"-lock/confirmation", "role.escrow-escrow", domain.Data{"id": id + "-deposit"})
		must(t, app, root+"/custody-statements", "role.escrow-escrow", domain.Data{"id": id + "-statement"})
		must(t, app, root+"/custody-statements/"+id+"-statement/confirmation", "role.escrow-buyer", domain.Data{"id": id + "-custody", "acknowledged": true})
	}
	linked := domain.Data{"id": "fulfillment", "order_confirmation_id": "a-order", "deposit_confirmation_id": "b-deposit"}
	if call(app, "POST", "/fulfillments", "role.fulfillment-buyer", when, linked).Code != 422 {
		t.Fatal("cross-order deposit")
	}
	linked["deposit_confirmation_id"] = "a-deposit"
	must(t, app, "/fulfillments", "role.fulfillment-buyer", linked)
	root := "/fulfillments/fulfillment"
	must(t, app, root+"/deliveries", "role.fulfillment-buyer", domain.Data{"id": "delivery"})
	must(t, app, root+"/deliveries/delivery/confirmation", "role.fulfillment-seller", domain.Data{"id": "delivered", "delivered_quantity": 2})
	must(t, app, root+"/acceptances", "role.fulfillment-seller", domain.Data{"id": "accept"})
	must(t, app, root+"/acceptances/accept/confirmation", "role.fulfillment-buyer", domain.Data{"id": "accepted", "accepted": true})
	must(t, app, "/settlements", "role.settlement-seller", domain.Data{"id": "settlement", "order_confirmation_id": "a-order", "deposit_confirmation_id": "a-deposit", "acceptance_confirmation_id": "accepted"})
	path := "/settlements/settlement/releases"
	must(t, app, path, "role.settlement-seller", domain.Data{"id": "release"})
	var wg sync.WaitGroup
	codes := make(chan int, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			codes <- call(app, "POST", path+"/release/confirmation", "role.settlement-escrow", when, domain.Data{"id": fmt.Sprint("released", i)}).Code
		}(i)
	}
	wg.Wait()
	close(codes)
	counts := map[int]int{}
	for code := range codes {
		counts[code]++
	}
	if counts[201] != 1 || counts[409] != 1 {
		t.Fatal(counts)
	}
}
func TestV1AndExpiry(t *testing.T) {
	app := New(Options{TestMode: true, Mode: "v1", Clock: func() time.Time { n, _ := domain.ParseTime(when); return n }})
	setupOrder(t, app, "a")
	if call(app, "POST", "/fulfillments/x/first-milestones", "role.fulfillment-buyer", when, domain.Data{"id": "x"}).Code != 404 {
		t.Fatal("v1 exposes milestone")
	}
	must(t, app, "/agreements", "role.procurement-buyer", terms("expired"))
	must(t, app, "/agreements/expired/orders", "role.procurement-buyer", domain.Data{"id": "exp"})
	if call(app, "POST", "/agreements/expired/orders/exp/confirmation", "role.procurement-seller", "2026-06-03T00:00:01Z", domain.Data{"id": "no"}).Code != 422 {
		t.Fatal("expired request confirmed")
	}
}
