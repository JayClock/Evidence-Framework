package httpapi

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"example.com/escrow/internal/domain"
)

func TestFaultsAreExplicitAndTestOnly(t *testing.T) {
	for _, fault := range []string{"none", "accept-derived", "extra-field", "clock", "precision"} {
		t.Run(fault, func(t *testing.T) {
			clock := func() time.Time { n, _ := domain.ParseTime("2026-07-09T00:00:00Z"); return n }
			closed := New(Options{Fault: fault})
			if r := call(closed, "POST", "/procurement/agreement", "role.procurement-buyer", when, terms("closed")); r.Code != 503 {
				t.Fatal("fault bypassed test-mode guard", r.Code)
			}
			app := New(Options{TestMode: true, Fault: fault, Clock: clock})
			r := call(app, "POST", "/procurement/agreement", "role.procurement-buyer", when, terms("fault"))
			var d domain.Data
			_ = json.Unmarshal(r.Body.Bytes(), &d)
			if r.Code != 201 {
				t.Fatal(r.Code, r.Body)
			}
			if (d["unmodeled"] == true) != (fault == "extra-field") {
				t.Fatal(d)
			}
			if (d["signed_at"] != when) != (fault == "clock") {
				t.Fatal(d)
			}
			want := "10000000000000001"
			if fault == "precision" {
				want = "10000000000000000"
			}
			if d["tier1_unit_price_minor"] != want {
				t.Fatal(d)
			}
			// Even broken modes retain authentication and clock syntax guards.
			if call(app, "POST", "/procurement/agreement", "role.procurement-escrow", when, terms("forbidden")).Code != 403 {
				t.Fatal("authorization bypass")
			}
			if call(app, "POST", "/procurement/agreement", "role.procurement-buyer", "bad", terms("bad")).Code != 400 {
				t.Fatal("invalid clock accepted")
			}
			path := "/settlement/settlement/absent/release/request/absent/confirmation"
			r = call(app, http.MethodPost, path, "role.settlement-escrow", when, domain.Data{"id": "tamper", "payout_minor": 999999})
			wantStatus := 422
			if fault == "accept-derived" {
				wantStatus = 201
			}
			if r.Code != wantStatus {
				t.Fatal(r.Code, r.Body)
			}
		})
	}
	if ValidFault("unknown") {
		t.Fatal("unknown fault accepted")
	}
	defer func() {
		if recover() == nil {
			t.Fatal("unknown fault did not fail closed")
		}
	}()
	New(Options{TestMode: true, Fault: "unknown"})
}
