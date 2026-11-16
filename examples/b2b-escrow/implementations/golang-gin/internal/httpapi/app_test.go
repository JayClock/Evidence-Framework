package httpapi

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
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
	return d
}
func setupOrder(t *testing.T, app http.Handler, id string) {
	t.Helper()
	root := "/procurement/agreement/" + id
	must(t, app, "/procurement/agreement", "role.procurement-buyer", terms(id))
	must(t, app, root+"/order/request", "role.procurement-buyer", domain.Data{"id": id + "-request"})
	must(t, app, root+"/order/request/"+id+"-request/confirmation", "role.procurement-seller", domain.Data{"id": id + "-order"})
	must(t, app, root+"/commitment/request", "role.procurement-seller", domain.Data{"id": id + "-commit"})
	must(t, app, root+"/commitment/request/"+id+"-commit/confirmation", "role.procurement-buyer", domain.Data{"id": id + "-committed", "acknowledged": true})
}
func TestSecurityStrictInputsAndGet(t *testing.T) {
	app := New(Options{TestMode: true})
	for _, test := range []struct {
		role, clock string
		status      int
	}{{"", when, 401}, {"role.procurement-buyer", "bad", 400}, {"role.procurement-buyer", "2026-02-30T00:00:00Z", 400}, {"role.procurement-escrow", when, 403}} {
		r := call(app, "POST", "/procurement/agreement", test.role, test.clock, terms("x"))
		if r.Code != test.status {
			t.Fatal(r.Code, r.Body)
		}
	}
	r := call(New(Options{}), "POST", "/procurement/agreement", "role.procurement-buyer", when, terms("x"))
	if r.Code != 503 {
		t.Fatal(r.Code)
	}
	bad := terms("bad")
	bad["signed_at"] = when
	if call(app, "POST", "/procurement/agreement", "role.procurement-buyer", when, bad).Code != 422 {
		t.Fatal("accepted server stamp")
	}
	for _, v := range []any{true, 9007199254740992.0, "9223372036854775808", 0} {
		bad = terms("bad")
		bad["quantity"] = v
		if call(app, "POST", "/procurement/agreement", "role.procurement-buyer", when, bad).Code != 422 {
			t.Fatal("accepted invalid integer", v)
		}
	}
	must(t, app, "/procurement/agreement", "role.procurement-buyer", terms("x"))
	r = call(app, "GET", "/procurement/agreement/x", "role.procurement-seller", when, nil)
	if r.Code != 200 || r.Header().Get("Content-Type") != "application/hal+json" {
		t.Fatal(r.Code, r.Header())
	}
	if call(app, "POST", "/procurement/agreement", "role.procurement-buyer", when, terms("x")).Code != 409 {
		t.Fatal("duplicate ID")
	}
	if call(app, "POST", "/procurement/agreement/x/order/request", "role.procurement-buyer", "2026-05-31T00:00:00Z", domain.Data{"id": "early"}).Code != 422 {
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
			r := call(app, "POST", "/procurement/agreement", "role.procurement-buyer", clock, terms(fmt.Sprint(i)))
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
		root := "/escrow/escrow/" + id + "-escrow"
		must(t, app, "/escrow/escrow", "role.escrow-buyer", domain.Data{"id": id + "-escrow", "order_confirmation_id": id + "-order"})
		must(t, app, root+"/deposit-lock/request", "role.escrow-buyer", domain.Data{"id": id + "-lock"})
		must(t, app, root+"/deposit-lock/request/"+id+"-lock/confirmation", "role.escrow-escrow", domain.Data{"id": id + "-deposit"})
		must(t, app, root+"/custody-statement/request", "role.escrow-escrow", domain.Data{"id": id + "-statement"})
		must(t, app, root+"/custody-statement/request/"+id+"-statement/confirmation", "role.escrow-buyer", domain.Data{"id": id + "-custody", "acknowledged": true})
	}
	linked := domain.Data{"id": "fulfillment", "order_confirmation_id": "a-order", "deposit_confirmation_id": "b-deposit"}
	if call(app, "POST", "/fulfillment/fulfillment", "role.fulfillment-buyer", when, linked).Code != 422 {
		t.Fatal("cross-order deposit")
	}
	linked["deposit_confirmation_id"] = "a-deposit"
	must(t, app, "/fulfillment/fulfillment", "role.fulfillment-buyer", linked)
	root := "/fulfillment/fulfillment/fulfillment"
	must(t, app, root+"/delivery/request", "role.fulfillment-buyer", domain.Data{"id": "delivery"})
	must(t, app, root+"/delivery/request/delivery/confirmation", "role.fulfillment-seller", domain.Data{"id": "delivered", "delivered_quantity": 2})
	must(t, app, root+"/acceptance/request", "role.fulfillment-seller", domain.Data{"id": "accept"})
	must(t, app, root+"/acceptance/request/accept/confirmation", "role.fulfillment-buyer", domain.Data{"id": "accepted", "accepted": true})
	must(t, app, "/settlement/settlement", "role.settlement-seller", domain.Data{"id": "settlement", "order_confirmation_id": "a-order", "deposit_confirmation_id": "a-deposit", "acceptance_confirmation_id": "accepted"})
	path := "/settlement/settlement/settlement/release/request"
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
	if call(app, "POST", "/fulfillment/fulfillment/x/first-milestone/request", "role.fulfillment-buyer", when, domain.Data{"id": "x"}).Code != 404 {
		t.Fatal("v1 exposes milestone")
	}
	must(t, app, "/procurement/agreement", "role.procurement-buyer", terms("expired"))
	must(t, app, "/procurement/agreement/expired/order/request", "role.procurement-buyer", domain.Data{"id": "exp"})
	if call(app, "POST", "/procurement/agreement/expired/order/request/exp/confirmation", "role.procurement-seller", "2026-06-03T00:00:01Z", domain.Data{"id": "no"}).Code != 422 {
		t.Fatal("expired request confirmed")
	}
}
