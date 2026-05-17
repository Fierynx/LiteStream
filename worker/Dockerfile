FROM golang:1.26.2-alpine AS builder

WORKDIR /app

RUN apk add --no-cache gcc musl-dev

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o worker .

FROM alpine:latest

WORKDIR /root/

RUN apk --no-cache add ca-certificates curl

COPY --from=builder /app/worker .

CMD ["./worker"]
