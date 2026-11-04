// Servidor estático mínimo para a pasta do app (sem dependências).
// Aplica os mesmos cabeçalhos do firebase.json (hosting.headers) — assim os testes pegam erro de CSP.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const raiz = path.join(__dirname, "../../demandas-projetos");
const porta = Number(process.env.PORT || 4173);
const tipos = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".svg": "image/svg+xml" };

/** Glob do Firebase Hosting (**, *, @(a|b)) → RegExp. */
function globParaRegex(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      re += ".*";
      i++;
    } else if (c === "*") re += "[^/]*";
    else if (c === "@" && glob[i + 1] === "(") {
      const fim = glob.indexOf(")", i);
      re += `(?:${glob.slice(i + 2, fim).split("|").map((p) => p.replace(/[.+^${}()|[\]\\]/g, "\\$&")).join("|")})`;
      i = fim;
    } else re += c.replace(/[.+^${}()|[\]\\?]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

const regrasCabecalhos = (JSON.parse(fs.readFileSync(path.join(__dirname, "../../firebase.json"), "utf8")).hosting?.headers || []).map(
  (r) => ({ re: globParaRegex(r.source), headers: r.headers }),
);

function cabecalhosPara(url) {
  const out = {};
  for (const r of regrasCabecalhos) {
    if (r.re.test(url)) for (const h of r.headers) out[h.key] = h.value;
  }
  return out;
}

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
      res.writeHead(200, { ...cabecalhosPara(url), "Content-Type": tipos[path.extname(arquivo)] || "application/octet-stream" });
      res.end(dados);
    });
  })
  .listen(porta, () => console.log(`servindo ${raiz} em http://localhost:${porta}`));
