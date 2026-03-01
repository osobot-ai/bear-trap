FROM rust:1.85-slim AS builder
WORKDIR /app
COPY backend/ ./backend/
COPY guests/ ./guests/
COPY Cargo.toml ./Cargo.toml
COPY rust-toolchain.toml ./rust-toolchain.toml
RUN cd backend && cargo build --release --bin bear-trap-api --bin bear-trap-admin
# Note: guests/ needs to be available for risc0-build to compile the guest ELF

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/backend/target/release/bear-trap-api /usr/local/bin/
COPY --from=builder /app/backend/target/release/bear-trap-admin /usr/local/bin/
RUN mkdir -p /data
ENV DATABASE_PATH=/data/puzzles.db
EXPOSE 3001
CMD ["bear-trap-api"]
