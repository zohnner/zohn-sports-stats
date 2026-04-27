Check that the key MLB Stats API endpoints are reachable and returning expected data.

Run these checks:

Determine the current MLB season year first: Mar–Oct → current calendar year; Nov–Feb → previous calendar year. Use that year as `SEASON` in the URLs below.

```bash
SEASON=$(node -e "const m=new Date().getMonth()+1; console.log(m>=3&&m<=10 ? new Date().getFullYear() : new Date().getFullYear()-1)")

# Teams
curl -s -o /dev/null -w "%{http_code}" "https://statsapi.mlb.com/api/v1/teams?sportId=1&season=${SEASON}"

# Today's schedule
curl -s -o /dev/null -w "%{http_code}" "https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=$(date +%Y-%m-%d)&endDate=$(date +%Y-%m-%d)"

# Season hitting stats
curl -s -o /dev/null -w "%{http_code}" "https://statsapi.mlb.com/api/v1/stats?stats=season&season=${SEASON}&group=hitting&sportId=1&limit=1"

# Season pitching stats
curl -s -o /dev/null -w "%{http_code}" "https://statsapi.mlb.com/api/v1/stats?stats=season&season=${SEASON}&group=pitching&sportId=1&limit=1"
```

Report each endpoint with its HTTP status code. Flag any non-200 response as a problem.
