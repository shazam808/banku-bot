Deno.serve((request) => {
  if (request.method === "GET" && new URL(request.url).pathname === "/health") {
    return Response.json({ status: "ok" }, { headers: { "cache-control": "no-store" } });
  }
  return new Response("Not found", { status: 404 });
});
