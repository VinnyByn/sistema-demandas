// Servidor estático mínimo para a pasta do app (sem dependências).
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const raiz = path.join(__dirname, "../../demandas-projetos");
const porta = Number(process.env.PORT || 4173);
const tipos = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".svg": "image/svg+xml" };

http
  .createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const arquivo = path.normalize(path.join(raiz, url === "/" ? "index.html" : url));
    if (!arquivo.startsWith(raiz)) {
      res.writeHead(403).end();
      return;
    }
    fs.readFile(arquivo, (err, dados) => {
      if (err) {
        res.writeHead(404).end("não encontrado");
        return;
      }
      res.writeHead(200, { "Content-Type": tipos[path.extname(arquivo)] || "application/octet-stream" });
      res.end(dados);
    });
  })
  .listen(porta, () => console.log(`servindo ${raiz} em http://localhost:${porta}`));
