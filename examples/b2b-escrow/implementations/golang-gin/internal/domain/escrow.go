package domain

import (
	"encoding/json"
	"fmt"
	"math/big"
	"net/url"
	"regexp"
	"sync"
	"time"
	"unicode/utf8"
)

type Error struct {
	Status       int
	Code, Detail string
}

func (e *Error) Error() string             { return e.Detail }
func fail(status int, code, detail string) { panic(&Error{status, code, detail}) }
func require(ok bool, detail string) {
	if !ok {
		fail(422, "PRECONDITION_FAILED", detail)
	}
}
func invalid(detail string) { fail(422, "INVALID_INPUT", detail) }

type Data = map[string]any
type Fact struct {
	ID, Kind, ContractID, OrderID, RequestID, Href string
	Data                                           Data
}
type Definition struct {
	Name    string
	Roles   []string
	Actions map[string][2]string
}

var Definitions = map[string]Definition{
	"procurement": {"agreement", []string{"buyer", "seller"}, map[string][2]string{"order": {"buyer", "seller"}, "commitment": {"seller", "buyer"}}},
	"escrow":      {"escrow", []string{"buyer", "escrow"}, map[string][2]string{"deposit-lock": {"buyer", "escrow"}, "custody-statement": {"escrow", "buyer"}}},
	"fulfillment": {"fulfillment", []string{"buyer", "seller"}, map[string][2]string{"delivery": {"buyer", "seller"}, "acceptance": {"seller", "buyer"}, "first-milestone": {"buyer", "seller"}, "final-milestone": {"buyer", "seller"}, "milestone-acceptance": {"seller", "buyer"}}},
	"settlement":  {"settlement", []string{"seller", "escrow"}, map[string][2]string{"release": {"seller", "escrow"}, "settlement-receipt": {"escrow", "seller"}, "milestone-release": {"seller", "escrow"}, "milestone-statement": {"escrow", "seller"}}},
}

// CollectionOf keeps the standalone service's public business vocabulary local.
func CollectionOf(name string) string {
	if name == "delivery" {
		return "deliveries"
	}
	return name + "s"
}

func delivery(a string) bool {
	return a == "delivery" || a == "first-milestone" || a == "final-milestone"
}
func acceptance(a string) bool { return a == "acceptance" || a == "milestone-acceptance" }
func release(a string) bool    { return a == "release" || a == "milestone-release" }
func acknowledgment(a string) bool {
	return a == "commitment" || a == "custody-statement" || a == "settlement-receipt" || a == "milestone-statement"
}

var canonical = regexp.MustCompile(`^(0|-?[1-9][0-9]*)$`)
var utc = regexp.MustCompile(`^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$`)

const MaxSafe int64 = 9007199254740991

func ParseTime(s string) (time.Time, error) {
	if !utc.MatchString(s) {
		return time.Time{}, fmt.Errorf("expected whole-second UTC timestamp")
	}
	return time.Parse(time.RFC3339, s)
}
func integer(v any) int64 {
	var text string
	switch x := v.(type) {
	case json.Number:
		text = string(x)
	case string:
		text = x
	default:
		invalid("Expected integer or exact decimal string")
	}
	if !canonical.MatchString(text) {
		invalid("Invalid integer")
	}
	n, ok := new(big.Int).SetString(text, 10)
	if !ok || !n.IsInt64() {
		invalid("Integer outside signed int64")
	}
	result := n.Int64()
	if _, number := v.(json.Number); number && (result > MaxSafe || result < -MaxSafe) {
		invalid("Unsafe JSON number; use exact decimal string")
	}
	return result
}
func parse(input Data, fields map[string]string) Data {
	if input == nil || len(input) != len(fields) {
		invalid("Missing or unknown fields")
	}
	out := Data{}
	for k, kind := range fields {
		v, exists := input[k]
		if !exists {
			invalid("Missing field " + k)
		}
		switch kind {
		case "id":
			s, ok := v.(string)
			if !ok || utf8.RuneCountInString(s) < 1 || utf8.RuneCountInString(s) > 200 {
				invalid("Invalid ID")
			}
			out[k] = s
		case "time":
			s, ok := v.(string)
			if !ok {
				invalid("Invalid time")
			}
			if _, err := ParseTime(s); err != nil {
				invalid("Invalid time")
			}
			out[k] = s
		case "true":
			b, ok := v.(bool)
			if !ok || !b {
				invalid("Expected true")
			}
			out[k] = true
		default:
			n := integer(v)
			if kind == "positive" && n <= 0 || kind == "bps" && (n < 0 || n > 10000) {
				invalid("Integer out of range")
			}
			out[k] = n
		}
	}
	return out
}
func narrow(n *big.Int) int64 {
	if !n.IsInt64() {
		invalid("Result outside signed int64")
	}
	return n.Int64()
}
func round(amount, bps int64) int64 {
	n := new(big.Int).Mul(big.NewInt(amount), big.NewInt(bps))
	n.Add(n, big.NewInt(5000))
	return narrow(n.Quo(n, big.NewInt(10000)))
}
func Price(d Data) Data {
	unit := d["tier1_unit_price_minor"].(int64)
	if d["quantity"].(int64) >= d["tier_threshold"].(int64) {
		unit = d["tier2_unit_price_minor"].(int64)
	}
	subtotal := narrow(new(big.Int).Mul(big.NewInt(d["quantity"].(int64)), big.NewInt(unit)))
	return Data{"subtotal_minor": subtotal, "gross_amount_minor": round(subtotal, 10000+d["tax_bps"].(int64))}
}
func Settle(gross, retentionBps, dailyBps, days int64) Data {
	retention := round(gross, retentionBps)
	raw := new(big.Int).Mul(big.NewInt(gross), big.NewInt(days))
	raw.Mul(raw, big.NewInt(dailyBps))
	raw.Add(raw, big.NewInt(5000))
	raw.Quo(raw, big.NewInt(10000))
	cap := gross - retention
	penalty := cap
	if raw.Cmp(big.NewInt(cap)) < 0 {
		penalty = raw.Int64()
	}
	return Data{"gross_amount_minor": gross, "retention_minor": retention, "late_penalty_minor": penalty, "payout_minor": gross - retention - penalty}
}
func LateDays(now time.Time, deadline string) int64 {
	t, _ := ParseTime(deadline)
	delta := now.Unix() - t.Unix()
	if delta <= 0 {
		return 0
	}
	return (delta + 86399) / 86400
}
func stamp(t time.Time) string { return t.UTC().Format(time.RFC3339) }
func clone(f Fact) Fact {
	d := Data{}
	for k, v := range f.Data {
		d[k] = v
	}
	f.Data = d
	return f
}

// Memory-only transaction boundary: all checks and commits are under the same
// lock. A persistent adapter needs unique constraints and a database transaction.
type Ledger struct {
	mu    sync.Mutex
	facts map[string]Fact
}

func NewLedger() *Ledger { return &Ledger{facts: map[string]Fact{}} }
func (l *Ledger) get(id, kind string) Fact {
	f, ok := l.facts[id]
	if !ok || kind != "" && f.Kind != kind {
		fail(404, "NOT_FOUND", "Evidence does not exist")
	}
	return clone(f)
}
func (l *Ledger) find(contract, kind string) (Fact, bool) {
	for _, f := range l.facts {
		if f.ContractID == contract && f.Kind == kind {
			return clone(f), true
		}
	}
	return Fact{}, false
}
func (l *Ledger) previous(contract, kind string) Fact {
	f, ok := l.find(contract, kind)
	require(ok, "Missing prerequisite "+kind)
	return f
}
func (l *Ledger) released(order string) bool {
	for _, f := range l.facts {
		if f.OrderID == order && releaseKind(f.Kind) {
			return true
		}
	}
	return false
}
func releaseKind(k string) bool {
	return k == "confirmation.release" || k == "confirmation.milestone-release"
}
func (l *Ledger) commit(f Fact) Fact {
	if _, ok := l.facts[f.ID]; ok {
		fail(409, "CONFLICT", "Evidence ID already exists")
	}
	for _, old := range l.facts {
		if f.RequestID != "" && f.RequestID == old.RequestID {
			fail(409, "CONFLICT", "Request already confirmed")
		}
	}
	l.facts[f.ID] = clone(f)
	return clone(f)
}
func chronology(f Fact, now time.Time) {
	for _, k := range []string{"confirmed_at", "started_at", "signed_at"} {
		if s, ok := f.Data[k].(string); ok {
			t, _ := ParseTime(s)
			require(!now.Before(t), "Evidence cannot precede prerequisite")
			return
		}
	}
	invalid("Missing fact time")
}
func (l *Ledger) Get(id, kind string) Fact { l.mu.Lock(); defer l.mu.Unlock(); return l.get(id, kind) }
func (l *Ledger) List(kind, contract string) []Fact {
	l.mu.Lock()
	defer l.mu.Unlock()
	facts := make([]Fact, 0)
	for _, f := range l.facts {
		if f.Kind == kind && (contract == "" || f.ContractID == contract) {
			facts = append(facts, clone(f))
		}
	}
	return facts
}
func (l *Ledger) Confirmation(requestID string) Fact {
	l.mu.Lock()
	defer l.mu.Unlock()
	for _, f := range l.facts {
		if f.RequestID == requestID {
			return clone(f)
		}
	}
	fail(404, "NOT_FOUND", "Confirmation has not been formed")
	return Fact{}
}
func (l *Ledger) Sign(lane string, input Data, now time.Time) Fact {
	l.mu.Lock()
	defer l.mu.Unlock()
	fields := map[string]string{"id": "id"}
	if lane == "procurement" {
		for _, k := range []string{"quantity", "tier_threshold", "tier1_unit_price_minor", "tier2_unit_price_minor"} {
			fields[k] = "positive"
		}
		for _, k := range []string{"tax_bps", "retention_bps", "daily_penalty_bps"} {
			fields[k] = "bps"
		}
		fields["delivery_deadline"] = "time"
	} else {
		fields["order_confirmation_id"] = "id"
		if lane != "escrow" {
			fields["deposit_confirmation_id"] = "id"
		}
		if lane == "settlement" {
			fields["acceptance_confirmation_id"] = "id"
		}
	}
	d := parse(input, fields)
	id := d["id"].(string)
	orderID := id
	if lane == "procurement" {
		Price(d)
	} else {
		order := l.get(d["order_confirmation_id"].(string), "confirmation.order")
		orderID = order.ID
		chronology(order, now)
		chronology(l.previous(order.ContractID, "confirmation.commitment"), now)
		if lane != "escrow" {
			deposit := l.get(d["deposit_confirmation_id"].(string), "confirmation.deposit-lock")
			require(deposit.OrderID == order.ID, "Deposit belongs to another order")
			chronology(deposit, now)
			chronology(l.previous(deposit.ContractID, "confirmation.custody-statement"), now)
			require(deposit.Data["locked_amount_minor"] == order.Data["gross_amount_minor"], "Deposit is not fully funded")
		}
		if lane == "settlement" {
			accepted := l.get(d["acceptance_confirmation_id"].(string), "")
			require(acceptanceKind(accepted.Kind) && accepted.OrderID == order.ID && accepted.Data["accepted"] == true, "Invalid acceptance evidence")
			chronology(accepted, now)
			fulfillment := l.get(accepted.ContractID, "contract.fulfillment")
			require(fulfillment.Data["deposit_confirmation_id"] == d["deposit_confirmation_id"], "Acceptance uses another deposit")
		}
	}
	d["signed_at"] = stamp(now)
	return l.commit(Fact{ID: id, Kind: "contract." + Definitions[lane].Name, ContractID: id, OrderID: orderID, Data: d, Href: "/" + CollectionOf(Definitions[lane].Name) + "/" + url.PathEscape(id)})
}
func acceptanceKind(k string) bool {
	return k == "confirmation.acceptance" || k == "confirmation.milestone-acceptance"
}
func (l *Ledger) Request(lane, action, contractID string, input Data, now time.Time) Fact {
	l.mu.Lock()
	defer l.mu.Unlock()
	d := parse(input, map[string]string{"id": "id"})
	c := l.get(contractID, "contract."+Definitions[lane].Name)
	chronology(c, now)
	_, exists := l.find(contractID, "request."+action)
	require(!exists, "Obligation already requested")
	prerequisites := map[string]string{"commitment": "order", "custody-statement": "deposit-lock", "acceptance": "delivery", "final-milestone": "first-milestone", "milestone-acceptance": "final-milestone", "settlement-receipt": "release", "milestone-statement": "milestone-release"}
	if p, ok := prerequisites[action]; ok {
		chronology(l.previous(contractID, "confirmation."+p), now)
	}
	if release(action) {
		a := l.get(c.Data["acceptance_confirmation_id"].(string), "")
		kind := "acceptance"
		if action == "milestone-release" {
			kind = "milestone-acceptance"
		}
		require(a.Kind == "confirmation."+kind, "Release does not match acceptance")
		require(!l.released(c.OrderID), "Order already released")
	}
	if delivery(action) {
		other := "delivery"
		if action == "delivery" {
			other = "first-milestone"
		}
		_, mixed := l.find(contractID, "request."+other)
		require(!mixed, "Cannot mix delivery modes")
	}
	d["started_at"] = stamp(now)
	d["expired_at"] = stamp(now.Add(48 * time.Hour))
	id := d["id"].(string)
	return l.commit(Fact{ID: id, Kind: "request." + action, ContractID: contractID, OrderID: c.OrderID, Data: d, Href: c.Href + "/" + CollectionOf(action) + "/" + url.PathEscape(id)})
}
func (l *Ledger) Confirm(lane, action, contractID, requestID string, input Data, now time.Time) Fact {
	l.mu.Lock()
	defer l.mu.Unlock()
	fields := map[string]string{"id": "id"}
	if delivery(action) {
		fields["delivered_quantity"] = "positive"
	}
	if acceptance(action) {
		fields["accepted"] = "true"
	}
	if acknowledgment(action) {
		fields["acknowledged"] = "true"
	}
	d := parse(input, fields)
	c := l.get(contractID, "contract."+Definitions[lane].Name)
	r := l.get(requestID, "request."+action)
	require(r.ContractID == contractID, "Request belongs to another contract")
	chronology(r, now)
	expiry, _ := ParseTime(r.Data["expired_at"].(string))
	require(!now.After(expiry), "Request expired")
	order := func() Fact { return l.get(c.Data["order_confirmation_id"].(string), "confirmation.order") }
	if action == "order" {
		for k, v := range Price(c.Data) {
			d[k] = v
		}
		for _, k := range []string{"quantity", "retention_bps", "daily_penalty_bps", "delivery_deadline"} {
			d[k] = c.Data[k]
		}
	} else if action == "deposit-lock" {
		d["locked_amount_minor"] = order().Data["gross_amount_minor"]
	} else if delivery(action) {
		q := d["delivered_quantity"].(int64)
		ordered := order().Data["quantity"].(int64)
		switch action {
		case "delivery":
			require(q == ordered, "Incomplete delivery")
		case "first-milestone":
			require(q < ordered, "First milestone must leave remainder")
		default:
			first := l.previous(contractID, "confirmation.first-milestone").Data["delivered_quantity"].(int64)
			require(q == ordered-first, "Invalid milestone total")
		}
	} else if acceptance(action) {
		o := order()
		kind := "delivery"
		if action == "milestone-acceptance" {
			kind = "first-milestone"
		}
		q := l.previous(contractID, "confirmation."+kind).Data["delivered_quantity"].(int64)
		if action == "milestone-acceptance" {
			q += l.previous(contractID, "confirmation.final-milestone").Data["delivered_quantity"].(int64)
		}
		require(q == o.Data["quantity"], "Incomplete delivery")
		d["accepted_quantity"] = q
		d["late_days"] = LateDays(now, o.Data["delivery_deadline"].(string))
	} else if release(action) {
		if l.released(c.OrderID) {
			fail(409, "ALREADY_CONFIRMED", "Order already released")
		}
		o := order()
		a := l.get(c.Data["acceptance_confirmation_id"].(string), "")
		for k, v := range Settle(o.Data["gross_amount_minor"].(int64), o.Data["retention_bps"].(int64), o.Data["daily_penalty_bps"].(int64), a.Data["late_days"].(int64)) {
			d[k] = v
		}
	}
	id := d["id"].(string)
	d["confirmed_at"] = stamp(now)
	orderID := c.OrderID
	if action == "order" {
		orderID = id
	}
	return l.commit(Fact{ID: id, Kind: "confirmation." + action, ContractID: contractID, OrderID: orderID, RequestID: requestID, Data: d, Href: "/" + action + "-confirmations/" + url.PathEscape(id)})
}
func Representation(f Fact) Data {
	d := clone(f).Data
	for k, v := range d {
		if n, ok := v.(int64); ok && (n > MaxSafe || n < -MaxSafe) {
			d[k] = fmt.Sprint(n)
		}
	}
	d["_links"] = Data{"self": Data{"href": f.Href}}
	return d
}
