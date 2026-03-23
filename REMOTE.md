# Remote Assistance

## Goal

This stack runs a self-hosted RustDesk server alongside the main product so
Windows Desk can later connect to client workstations from inside ticket chats.

## Required DNS

Create:

- `A remote.i-zone.pro -> 2.27.54.185`

## Required Firewall Ports

Open on the VPS:

- `21115/tcp`
- `21116/tcp`
- `21116/udp`
- `21117/tcp`
- `21118/tcp`
- `21119/tcp`

## Files

- [docker-compose.remote.yml](C:\Users\user\Desktop\codex\docker-compose.remote.yml)
- [.env.remote.example](C:\Users\user\Desktop\codex\.env.remote.example)
- [deploy-remote.sh](C:\Users\user\Desktop\codex\scripts\deploy-remote.sh)

## Server Deploy

```sh
cd /opt/zona-it-support/current
cp .env.remote.example .env.remote
vi .env.remote
./scripts/deploy-remote.sh
```

## Get RustDesk Public Key

```sh
docker exec zona-it-rustdesk-id cat /root/id_ed25519.pub
```

## Next Integration Step

- pass server host and public key into Windows Desk
- bind ticket remote sessions to real RustDesk launch/connect actions
- add unattended access policy and device registry UI
