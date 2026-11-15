// Copy into a net/http app. Gin can use the same request.Context() clock.
package middleware

import (
    "context"
    "net/http"
    "time"
)

type clockKey struct{}

// enabled must come from trusted server configuration, never from a request.
func EvidenceClockMiddleware(enabled bool, next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        if enabled {
            if now, err := time.Parse(time.RFC3339Nano, r.Header.Get("x-evidence-asof")); err == nil && now.Location() == time.UTC {
                r = r.WithContext(context.WithValue(r.Context(), clockKey{}, now))
            }
        }
        next.ServeHTTP(w, r)
    })
}

func Now(ctx context.Context) time.Time {
    if now, ok := ctx.Value(clockKey{}).(time.Time); ok {
        return now
    }
    return time.Now().UTC()
}
