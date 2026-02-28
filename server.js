const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

const PORT = 3000;

// === LOAD STREAMING SERVICES FROM ./streamingServices ===
const SERVICES_DIR = path.join(__dirname, "streamingServices");

let streamingServices = [];
let orderHistory = [];

async function loadServices() {
    const files = await fs.promises.readdir(SERVICES_DIR);
    const jsonFiles = files.filter(f => f.endsWith(".json"));

    for (let file of jsonFiles) {
        const data = await fs.promises.readFile(
            path.join(SERVICES_DIR, file),
            "utf8"
        );
        streamingServices.push(JSON.parse(data));
    }
}

function serveStatic(filePath, res) {
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, {"Content-Type": "text/plain"});
            return res.end("404 Not Found");
        }

        const ext = path.extname(filePath);
        const mimeTypes = {
            ".html": "text/html",
            ".css": "text/css",
            ".js": "application/javascript",
            ".json": "application/json",
            ".svg": "image/svg+xml"
        };

        res.writeHead(200, {
            "Content-Type": mimeTypes[ext] || "application/octet-stream"
        });
        res.end(data);
    });
}

function handleRequest(req, res) {

    const parsed = url.parse(req.url, true);
    let pathname = parsed.pathname;

    // =========================
    // POST: submit order
    // =========================
    if (req.method === "POST" && pathname === "/submit-order") {

        let body = "";
        req.setEncoding("utf8");

        req.on("data", chunk => {
            body += chunk;
        });

        req.on("end", () => {
            console.log("POST /submit-order RAW BODY:", body);

            if (!body || body.trim() === "") {
                res.writeHead(400, {"Content-Type": "text/plain"});
                return res.end("Empty request body");
            }

            try {
                const order = JSON.parse(body);

                // make sure you have this near the top of server.js:
                // let orderHistory = [];
                orderHistory.push(order);

                res.writeHead(200, {"Content-Type": "application/json"});
                return res.end(JSON.stringify({ status: "ok" }));

            } catch (err) {
                console.log("JSON PARSE ERROR:", err.message);
                res.writeHead(400, {"Content-Type": "text/plain"});
                return res.end("Invalid JSON");
            }
        });

        req.on("error", (err) => {
            console.log("REQUEST ERROR:", err.message);
            res.writeHead(500, {"Content-Type": "text/plain"});
            res.end("Request error");
        });

        return;
    }

    // GET: pages + services + static

    if (req.method === "GET") {
        if (pathname === "/") pathname = "/home.html";
        if (pathname === "/order") pathname = "/index.html";
        if (pathname === "/stats") pathname = "/stats.html";

        // /services and /services?id=n
        if (pathname === "/services") {

            const id = parsed.query.id;

            if (id !== undefined) {
                const service = streamingServices.find(s => String(s.id) === String(id));
                if (!service) {
                    res.writeHead(404, {"Content-Type": "text/plain"});
                    return res.end("Service not found");
                }
                res.writeHead(200, {"Content-Type": "application/json"});
                return res.end(JSON.stringify(service));
            }

            const summary = streamingServices.map(s => ({
                id: s.id,
                name: s.name,
                minOrder: s.minOrder,
                serviceFee: s.serviceFee
            }));

            res.writeHead(200, {"Content-Type": "application/json"});
            return res.end(JSON.stringify(summary));
        }

                // /stats-data
        if (pathname === "/stats-data") {

            const stats = streamingServices.map(service => {

                let totalMovies = 0;
                let totalRevenue = 0;
                let orderCount = 0;
                const movieCounts = {};

                orderHistory.forEach(order => {
                    if (order.movies && order.movies[service.name]) {

                        orderCount++;

                        order.movies[service.name].forEach(movie => {
                            totalMovies++;
                            totalRevenue += Number(movie.price);

                            movieCounts[movie.title] = (movieCounts[movie.title] || 0) + 1;
                        });

                        if (order.fees && order.fees[service.name] !== undefined) {
                            totalRevenue += Number(order.fees[service.name]);
                        }
                    }
                });

                let mostPopular = "";
                let maxCount = 0;
                for (const title in movieCounts) {
                    if (movieCounts[title] > maxCount) {
                        maxCount = movieCounts[title];
                        mostPopular = title;
                    }
                }

                const avgOrder = orderCount ? (totalRevenue / orderCount) : 0;

                return {
                    name: service.name,
                    totalMovies,
                    totalRevenue: Number(totalRevenue.toFixed(2)),
                    avgOrder: Number(avgOrder.toFixed(2)),
                    mostPopular: mostPopular || "None yet"
                };
            });

            res.writeHead(200, {"Content-Type": "application/json"});
            return res.end(JSON.stringify(stats));
        }
        // serve static files
        const safePath = pathname.startsWith("/") ? pathname.slice(1) : pathname;
        const filePath = path.join(__dirname, safePath);
        return serveStatic(filePath, res);
    }

    res.writeHead(405, {"Content-Type": "text/plain"});
    res.end("Method Not Allowed");
}

// Start server AFTER JSON loads
loadServices().then(() => {
    http.createServer(handleRequest).listen(PORT);
    console.log("Server running at http://localhost:3000");
}).catch(err => {
    console.error("Failed to load services:", err);
});
