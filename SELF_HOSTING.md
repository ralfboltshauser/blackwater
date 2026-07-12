# Self-hosting Blackwater

Blackwater is a single same-origin application: host console, TV display,
phone UI, realtime server, and SQLite database all run in one container. No
cloud account is required for normal browser play.

## Mac or Linux: quickest start

Install Docker Desktop (macOS) or Docker Engine with the Compose plugin
(Linux), then run:

```bash
git clone https://github.com/ralfboltshauser/blackwater.git
cd blackwater
./blackwater up
```

The launcher detects the active LAN interface at runtime and prints a Host
Controls URL. Open that exact URL on the laptop used as the shared screen.
Friends on the same Wi-Fi can then scan the room QR code.

Add `-d` to run in the background. Stop it later with `./blackwater down`.
Game data persists in the Docker volume `blackwater_data`.

## Raw Docker Compose

The standard command also works without an environment file:

```bash
docker compose up --build
```

In this mode, Blackwater derives all room links from the address used to open
Host Controls. Open `http://<this-computer's-LAN-address>:8787/host`, not a
loopback-only URL, before creating the room. Nothing in the repository assumes
a particular home subnet or machine address.

On macOS, this prints the active Wi-Fi/Ethernet address:

```bash
ipconfig getifaddr "$(route -n get default | awk '/interface:/{print $2; exit}')"
```

If macOS asks whether Docker may accept incoming connections, allow it. Ensure
the Mac and phones are on the same non-guest Wi-Fi; guest/client isolation can
prevent devices from reaching each other.

## Optional configuration

Copy `.env.example` only when changing ports, image tags, allowed private
networks, or adding a stable HTTPS origin. An explicitly configured origin wins
over request-derived links. The image is built natively by Docker, so the same
Compose file supports Apple silicon and Intel/AMD machines without a fixed
platform setting.

## PWA and HTTPS options

LAN browser mode deliberately uses plain HTTP and cannot trigger Chrome's normal
PWA installation flow, which [requires HTTPS](https://web.dev/articles/install-criteria).
Browsers treat HTTP localhost as trustworthy only on the same device
([secure-context rules](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts));
a phone's localhost is the phone, not the game laptop. The host/TV experience
still works normally.

Practical secure modes, from smallest to largest:

1. **Private Tailscale game:** use
   [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve) for a
   trusted HTTPS name.
   Every participating phone must join the same tailnet. This is excellent for
   your own devices but awkward for casual guests.

   ```bash
   tailscale serve --bg 8787
   export BLACKWATER_PUBLIC_URL=https://your-machine.your-tailnet.ts.net
   ./blackwater up -d
   ```

   Use the exact HTTPS name printed by Tailscale. Blackwater will keep the
   ordinary LAN browser URL alongside it.

2. **Trusted home-LAN name:** use a stable hostname, local DNS, and a reverse
   proxy certificate. A locally issued certificate requires installing and
   trusting that CA on every phone, as documented for
   [Caddy local HTTPS](https://caddyserver.com/docs/automatic-https#local-https).
   A public-domain certificate avoids that, but local DNS must map the name to
   the current laptop.
3. **Public tunnel:**
   [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/)
   or a comparable service can provide a trusted public HTTPS origin through an
   outbound-only connector. Protect access and accept that game traffic now
   depends on the internet and leaves the LAN.
4. **Blackwater relay (best future guest experience):** a small hosted relay
   would give each game one public HTTPS room URL while the laptop makes only an
   outbound connection. Phones, cookies, assets, and Socket.IO would remain on
   one secure origin, with no router, DNS, or certificate setup for guests.

A separately hosted static PWA pointed at an HTTP LAN backend is not a sound
shortcut: it breaks the same-origin session model and runs into secure-context,
mixed-content, and private-network restrictions. A tunnel or relay must proxy
the complete application origin instead.
