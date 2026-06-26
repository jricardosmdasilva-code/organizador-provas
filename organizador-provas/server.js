require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const COORD_SENHA = process.env.COORD_SENHA || 'Sport2026';

const PROFESSORES = [
  'Adriana Lins da Silva','Aline Elioenai Gomes de Souza','Ana Beatriz Vanderlei',
  'Aristophanes Henrique Claudiano','Bruno Vinícius de Melo Soatmann','Christiani Lira de Araújo',
  'Cleodon Lopes de Albuquerque Neto','Cryslaine Rafaella Santos Ribeiro da Silva',
  'Débora Angélica Vieira de Melo','Denilson Efraim Freitas da Silva',
  'Emerson Eduardo da Silva Barbosa','Emilyanna Monachele da Silva Aníbal',
  'João Pedro Lopes de Lima','José Adeilton Cordeiro de Souza','José Luís da Costa Oliveira',
  'Juliana Raysa Silva dos Santos','Leonor Fernanda Cantuária Gusmão','Lucas José do Nascimento',
  'Mariana Cavalcanti Pereira','Marcos Amaro Almeida','Patrícia Mariana Vasco de Goz',
  'Rauã Bezerra da Silva','Samanta Gabriela de Lima','Thiago Roberto Vieira Gomes',
  'Virgínia Estela Silva de Albuquerque','Wellington Borges da Silva Filho'
];

// ── LOGIN ──
app.post('/api/login', (req, res) => {
  const { senha } = req.body;
  res.json({ ok: senha === COORD_SENHA });
});

// ── ENVIAR QUESTÕES ──
app.post('/api/enviar', upload.single('arquivo'), async (req, res) => {
  try {
    const { professor, materia, simulado, ano } = req.body;
    if (!professor || !materia || !simulado) return res.status(400).json({ erro: 'Preencha todos os campos.' });
    if (!PROFESSORES.includes(professor)) return res.status(400).json({ erro: 'Professor não encontrado.' });
    const arquivo = req.file;
    if (!arquivo) return res.status(400).json({ erro: 'Nenhum arquivo enviado.' });

    const nomeArquivo = `${ano||'2025'}/${simulado}/${professor.replace(/\s+/g,'_')}.docx`;

    const { error: uploadError } = await supabase.storage
      .from('questoes')
      .upload(nomeArquivo, arquivo.buffer, { contentType: arquivo.mimetype, upsert: true });
    if (uploadError) throw uploadError;

    const { error: dbError } = await supabase
      .from('envios')
      .upsert({ professor, materia, simulado, ano: ano||'2025', arquivo: nomeArquivo, enviado_em: new Date().toISOString() },
        { onConflict: 'professor,simulado,ano' });
    if (dbError) throw dbError;

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao salvar. Tente novamente.' });
  }
});

// ── LISTAR ENVIOS ──
app.get('/api/envios', async (req, res) => {
  try {
    const { simulado, ano } = req.query;
    let query = supabase.from('envios').select('*').order('enviado_em', { ascending: false });
    if (simulado) query = query.eq('simulado', simulado);
    if (ano) query = query.eq('ano', ano);
    const { data, error } = await query;
    if (error) throw error;

    const lista = PROFESSORES.map(nome => {
      const envio = data.find(e => e.professor === nome);
      return {
        professor: nome,
        status: envio ? 'enviou' : 'pendente',
        materia: envio?.materia || null,
        simulado: envio?.simulado || null,
        enviado_em: envio?.enviado_em || null,
        arquivo: envio?.arquivo || null
      };
    });

    res.json({ ok: true, lista });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar envios.' });
  }
});

// ── BAIXAR ARQUIVO INDIVIDUAL ──
app.get('/api/arquivo/:professor', async (req, res) => {
  try {
    const { simulado, ano } = req.query;
    const { data, error } = await supabase.from('envios').select('arquivo,professor')
      .eq('professor', decodeURIComponent(req.params.professor))
      .eq('simulado', simulado).eq('ano', ano).single();
    if (error || !data) return res.status(404).json({ erro: 'Arquivo não encontrado.' });

    const { data: fileData, error: dlError } = await supabase.storage.from('questoes').download(data.arquivo);
    if (dlError) throw dlError;

    const buffer = Buffer.from(await fileData.arrayBuffer());
    const nomeDownload = `${data.professor.replace(/\s+/g,'_')}_${simulado}.docx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${nomeDownload}"`);
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao baixar arquivo.' });
  }
});

// ── BAIXAR TUDO JUNTO (mescla os docx) ──
app.get('/api/baixar-tudo', async (req, res) => {
  try {
    const { simulado, ano } = req.query;

    // Buscar todos os envios do simulado
    const { data, error } = await supabase.from('envios').select('*')
      .eq('simulado', simulado).eq('ano', ano||'2025').order('materia');
    if (error) throw error;
    if (!data || data.length === 0) return res.status(404).json({ erro: 'Nenhum arquivo encontrado para este simulado.' });

    // Baixar todos os buffers
    const buffers = [];
    for (const envio of data) {
      const { data: fileData, error: dlError } = await supabase.storage.from('questoes').download(envio.arquivo);
      if (!dlError && fileData) {
        const buf = Buffer.from(await fileData.arrayBuffer());
        buffers.push(buf);
      }
    }

    if (buffers.length === 0) return res.status(404).json({ erro: 'Nenhum arquivo encontrado.' });

    // Se só tem um arquivo, baixa direto
    if (buffers.length === 1) {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="prova_${simulado}_${ano}.docx"`);
      return res.send(buffers[0]);
    }

    // Mescla os docx usando python-docx via script python
    const { execSync } = require('child_process');
    const fs = require('fs');
    const os = require('os');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'provas-'));

    // Salvar arquivos temporários
    const arquivosPaths = buffers.map((buf, i) => {
      const p = path.join(tmpDir, `doc_${i}.docx`);
      fs.writeFileSync(p, buf);
      return p;
    });

    const outputPath = path.join(tmpDir, 'prova_final.docx');

    // Script Python para mesclar
    const script = `
import sys
from docx import Document
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
import copy

def add_page_break(doc):
    p = OxmlElement('w:p')
    r = OxmlElement('w:r')
    br = OxmlElement('w:br')
    br.set(qn('w:type'), 'page')
    r.append(br)
    p.append(r)
    doc.element.body.append(p)

files = ${JSON.stringify(arquivosPaths)}
output = "${outputPath}"

base = Document(files[0])

for i, f in enumerate(files[1:]):
    add_page_break(base)
    doc = Document(f)
    for element in doc.element.body:
        base.element.body.append(copy.deepcopy(element))

base.save(output)
print("ok")
`;

    const scriptPath = path.join(tmpDir, 'merge.py');
    fs.writeFileSync(scriptPath, script);

    try {
      execSync(`python3 -m pip install python-docx --quiet && python3 "${scriptPath}"`, { timeout: 60000 });
      const finalBuffer = fs.readFileSync(outputPath);

      // Limpar temp
      fs.rmSync(tmpDir, { recursive: true, force: true });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="prova_${simulado}_${ano}.docx"`);
      return res.send(finalBuffer);
    } catch (pyErr) {
      // Se python falhar, retorna o primeiro arquivo com aviso
      console.error('Python merge failed:', pyErr.message);
      fs.rmSync(tmpDir, { recursive: true, force: true });
      // Fallback: retorna o primeiro
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="prova_${simulado}_${ano}.docx"`);
      return res.send(buffers[0]);
    }

  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar arquivo.' });
  }
});

// ── ROTA PADRÃO ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servidor rodando em http://localhost:${PORT}`));
