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
  'Adriana Lins da Silva',
  'Aline Elioenai Gomes de Souza',
  'Ana Beatriz Vanderlei',
  'Aristophanes Henrique Claudiano',
  'Bruno Vinícius de Melo Soatmann',
  'Christiani Lira de Araújo',
  'Cleodon Lopes de Albuquerque Neto',
  'Cryslaine Rafaella Santos Ribeiro da Silva',
  'Débora Angélica Vieira de Melo',
  'Denilson Efraim Freitas da Silva',
  'Emerson Eduardo da Silva Barbosa',
  'Emilyanna Monachele da Silva Aníbal',
  'João Pedro Lopes de Lima',
  'José Adeilton Cordeiro de Souza',
  'José Luís da Costa Oliveira',
  'Juliana Raysa Silva dos Santos',
  'Leonor Fernanda Cantuária Gusmão',
  'Lucas José do Nascimento',
  'Mariana Cavalcanti Pereira',
  'Marcos Amaro Almeida',
  'Patrícia Mariana Vasco de Goz',
  'Rauã Bezerra da Silva',
  'Samanta Gabriela de Lima',
  'Thiago Roberto Vieira Gomes',
  'Virgínia Estela Silva de Albuquerque',
  'Wellington Borges da Silva Filho'
];

// ── VERIFICAR LOGIN COORDENADOR ──
app.post('/api/login', (req, res) => {
  const { senha } = req.body;
  if (senha === COORD_SENHA) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ ok: false, erro: 'Senha incorreta' });
  }
});

// ── ENVIAR QUESTÕES ──
app.post('/api/enviar', upload.single('arquivo'), async (req, res) => {
  try {
    const { professor, materia, simulado, ano } = req.body;

    if (!professor || !materia || !simulado) {
      return res.status(400).json({ erro: 'Preencha todos os campos.' });
    }

    if (!PROFESSORES.includes(professor)) {
      return res.status(400).json({ erro: 'Professor não encontrado.' });
    }

    const arquivo = req.file;
    if (!arquivo) {
      return res.status(400).json({ erro: 'Nenhum arquivo enviado.' });
    }

    // Salvar arquivo no Supabase Storage
    const nomeArquivo = `${Date.now()}_${professor.replace(/\s+/g, '_')}.docx`;
    const { error: uploadError } = await supabase.storage
      .from('questoes')
      .upload(nomeArquivo, arquivo.buffer, {
        contentType: arquivo.mimetype,
        upsert: true
      });

    if (uploadError) throw uploadError;

    // Registrar envio no banco de dados
    const { error: dbError } = await supabase
      .from('envios')
      .upsert({
        professor,
        materia,
        simulado,
        ano: ano || '2025',
        arquivo: nomeArquivo,
        enviado_em: new Date().toISOString()
      }, { onConflict: 'professor,simulado,ano' });

    if (dbError) throw dbError;

    res.json({ ok: true, mensagem: 'Questões enviadas com sucesso!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao salvar. Tente novamente.' });
  }
});

// ── LISTAR ENVIOS (coordenador) ──
app.get('/api/envios', async (req, res) => {
  try {
    const { simulado, ano } = req.query;

    let query = supabase.from('envios').select('*').order('enviado_em', { ascending: false });
    if (simulado) query = query.eq('simulado', simulado);
    if (ano) query = query.eq('ano', ano);

    const { data, error } = await query;
    if (error) throw error;

    // Montar lista completa com status de cada professor
    const enviados = data.map(e => e.professor);
    const lista = PROFESSORES.map(nome => {
      const envio = data.find(e => e.professor === nome);
      return {
        professor: nome,
        status: envio ? 'enviou' : 'pendente',
        materia: envio?.materia || null,
        simulado: envio?.simulado || null,
        enviado_em: envio?.enviado_em || null
      };
    });

    res.json({ ok: true, lista });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar envios.' });
  }
});

// ── BAIXAR ARQUIVO DE UM PROFESSOR ──
app.get('/api/arquivo/:professor', async (req, res) => {
  try {
    const { professor } = req.params;
    const { simulado, ano } = req.query;

    const { data, error } = await supabase
      .from('envios')
      .select('arquivo')
      .eq('professor', decodeURIComponent(professor))
      .eq('simulado', simulado)
      .eq('ano', ano)
      .single();

    if (error || !data) return res.status(404).json({ erro: 'Arquivo não encontrado.' });

    const { data: fileData, error: dlError } = await supabase.storage
      .from('questoes')
      .download(data.arquivo);

    if (dlError) throw dlError;

    const buffer = Buffer.from(await fileData.arrayBuffer());
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${data.arquivo}"`);
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao baixar arquivo.' });
  }
});

// ── ROTA PADRÃO ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Servidor rodando em http://localhost:${PORT}`);
});
