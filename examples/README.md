# Examples

These files are loaded by the in-app sample picker, so they stay honest: change
one here and the demo changes with it.

| File | What it shows |
| --- | --- |
| [`saas-starter.compose.yml`](saas-starter.compose.yml) | A realistic web / worker / Postgres / Redis stack. It is healthy apart from a missing worker healthcheck. |
| [`leaky-stack.compose.yml`](leaky-stack.compose.yml) | Deliberately unsafe. Literal secrets, a privileged container, the Docker socket, host networking, an unpinned image, public database ports and a missing dependency. |
| [`media-homelab.compose.yml`](media-homelab.compose.yml) | A self-hosted media stack with recent image tags, bind mounts, a public torrent port, and Watchtower mounting the Docker socket. |

The leaky file is the default demo. Do not deploy it.

## Loading

Drag a file onto the app, or use **Open file** in the source panel. There is no
server-side processing.

You can validate the YAML with Docker without starting anything:

```bash
docker compose -f leaky-stack.compose.yml config
```

`docker compose config` will refuse the leaky file because `api` depends on an
undefined `queue` service. That is one of the findings the demo is meant to
show.
