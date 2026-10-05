// /ready includes startup recovery and the bounded database probe. Never log
// config or underlying network/Prisma errors from a container health check.
fetch(`http://127.0.0.1:${process.env.PORT || "3000"}/ready`, {
  signal: AbortSignal.timeout(6500),
})
  .then(async (response) => {
    const body = await response.json();
    process.exit(response.ok && body.ok === true ? 0 : 1);
  })
  .catch(() => process.exit(1));
