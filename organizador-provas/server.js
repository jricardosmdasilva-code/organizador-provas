"""
Formatador de questões — EREM Monsenhor João Rodrigues de Carvalho
Lê um arquivo .docx do professor e retorna um .docx formatado no padrão da escola.
"""
import re
import sys
import copy
from docx import Document
from docx.shared import Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement


# ── LETRAS DE ALTERNATIVAS ──
LETRAS = ['a', 'b', 'c', 'd', 'e']

# Padrões para detectar início de questão
RE_QUESTAO = re.compile(
    r'^(\*{0,2})\s*(\d{1,2})\s*[-–\.)\]°º]',
    re.IGNORECASE
)

# Padrões para detectar alternativa
RE_ALT = re.compile(
    r'^\s*[-–]?\s*([aAbBcCdDeE])\s*[-–\)\.]\s*(.+)',
    re.DOTALL
)

# Padrões alternativos sem letra (só travessão)
RE_ALT_SEM_LETRA = re.compile(r'^\s*[-–•]\s*(.+)')

# Cabeçalho a ignorar (linhas que identificam o documento, não questões)
RE_CABECALHO = re.compile(
    r'(erem|monsenhor|prof\.|série|ano\s*[–-]|avalia[çc]|trimestre|simulado|gabarito)',
    re.IGNORECASE
)

# Referência de questão ex: (ENEM 2022), (SSA 2025)
RE_REF = re.compile(r'\((ENEM|SSA|SAEPE|ENADE)[\s\d\.]*\d{4}[\s\d\.]*\)', re.IGNORECASE)


def limpar_texto(txt):
    """Remove asteriscos de markdown e espaços extras."""
    txt = re.sub(r'\*+', '', txt)
    return txt.strip()


def is_cabecalho(txt):
    """Verifica se o parágrafo é cabeçalho/título do professor."""
    t = limpar_texto(txt)
    if len(t) < 3:
        return True
    if RE_CABECALHO.search(t) and len(t) < 120:
        # Só ignora se for curto (título) e não tiver alternativas
        if not RE_ALT.match(t):
            return True
    return False


def extrair_paragrafos(doc):
    """Extrai todos os parágrafos incluindo os dentro de tabelas."""
    items = []
    for block in doc.element.body:
        tag = block.tag.split('}')[-1]
        if tag == 'p':
            items.append(('p', block))
        elif tag == 'tbl':
            # Extrair texto de tabelas como parágrafo especial
            from docx.table import Table
            tbl = Table(block, doc)
            textos = []
            for row in tbl.rows:
                for cell in row.cells:
                    for p in cell.paragraphs:
                        t = p.text.strip()
                        if t:
                            textos.append(t)
            if textos:
                items.append(('tabela', ' | '.join(textos)))
    return items


class Questao:
    def __init__(self):
        self.numero = None
        self.referencia = ''
        self.enunciado_parts = []  # lista de (tipo, conteudo) onde tipo = 'texto' ou 'img'
        self.alternativas = []  # lista de (letra, texto)
        self.texto_apoio = []  # textos antes do enunciado principal
        self._alt_sem_letra_count = 0

    def adicionar_alternativa_sem_letra(self, texto):
        if self._alt_sem_letra_count < 5:
            letra = LETRAS[self._alt_sem_letra_count]
            self.alternativas.append((letra, texto))
            self._alt_sem_letra_count += 1

    def completa(self):
        return self.numero is not None and len(self.enunciado_parts) > 0


def parsear_questoes(doc):
    """Parseia o documento e retorna lista de Questao."""
    questoes = []
    questao_atual = None
    modo = 'inicio'  # inicio, enunciado, alternativas
    alt_sem_letra_buffer = []

    for para in doc.paragraphs:
        txt_raw = para.text.strip()
        txt = limpar_texto(txt_raw)

        if not txt:
            continue

        # Verificar se é início de nova questão
        m_q = RE_QUESTAO.match(txt_raw.strip())
        if m_q:
            # Salvar questão anterior
            if questao_atual and questao_atual.completa():
                # Processar alternativas sem letra se houver
                if alt_sem_letra_buffer and not questao_atual.alternativas:
                    for t in alt_sem_letra_buffer:
                        questao_atual.adicionar_alternativa_sem_letra(t)
                questoes.append(questao_atual)

            alt_sem_letra_buffer = []
            questao_atual = Questao()
            questao_atual.numero = int(m_q.group(2))
            modo = 'enunciado'

            # Extrair referência se houver
            ref_m = RE_REF.search(txt)
            if ref_m:
                questao_atual.referencia = ref_m.group(0)

            # Texto após o número — remove referência duplicada
            resto = txt_raw.strip()[m_q.end():].strip()
            resto = limpar_texto(resto)
            # Remove referência se já foi capturada
            if questao_atual.referencia:
                resto = resto.replace(questao_atual.referencia, '').strip()
            if resto:
                questao_atual.enunciado_parts.append(('texto', resto))
            continue

        if questao_atual is None:
            # Antes da primeira questão — ignorar cabeçalho
            continue

        # Verificar se é alternativa com letra
        m_alt = RE_ALT.match(txt)
        if m_alt:
            letra = m_alt.group(1).lower()
            conteudo = limpar_texto(m_alt.group(2))
            questao_atual.alternativas.append((letra, conteudo))
            modo = 'alternativas'
            continue

        # Verificar se é alternativa sem letra (travessão)
        m_alt2 = RE_ALT_SEM_LETRA.match(txt)
        if m_alt2 and modo == 'alternativas' or (m_alt2 and len(alt_sem_letra_buffer) > 0):
            alt_sem_letra_buffer.append(limpar_texto(m_alt2.group(1)))
            continue

        # Verificar se parece alternativa sem letra no modo enunciado
        if modo == 'enunciado' and RE_ALT_SEM_LETRA.match(txt):
            alt_sem_letra_buffer.append(limpar_texto(RE_ALT_SEM_LETRA.match(txt).group(1)))
            if len(alt_sem_letra_buffer) >= 2:
                modo = 'alternativas'
            continue

        # Cabeçalho a ignorar
        if is_cabecalho(txt) and questao_atual.numero is None:
            continue

        # Texto normal — vai para enunciado ou texto de apoio
        if modo == 'enunciado' or modo == 'inicio':
            questao_atual.enunciado_parts.append(('texto', txt))

    # Última questão
    if questao_atual and questao_atual.completa():
        if alt_sem_letra_buffer and not questao_atual.alternativas:
            for t in alt_sem_letra_buffer:
                questao_atual.adicionar_alternativa_sem_letra(t)
        questoes.append(questao_atual)

    return questoes


def set_paragraph_spacing(para, before=0, after=6):
    pPr = para._p.get_or_add_pPr()
    pSpacing = OxmlElement('w:spacing')
    pSpacing.set(qn('w:before'), str(before))
    pSpacing.set(qn('w:after'), str(after))
    pPr.append(pSpacing)


def adicionar_run_bold(para, texto, tamanho=11):
    run = para.add_run(texto)
    run.bold = True
    run.font.size = Pt(tamanho)
    run.font.name = 'Arial'
    return run


def adicionar_run_normal(para, texto, tamanho=11):
    run = para.add_run(texto)
    run.bold = False
    run.font.size = Pt(tamanho)
    run.font.name = 'Arial'
    return run


def gerar_documento_formatado(questoes, simulado='', ano='2025'):
    """Gera um novo documento Word formatado no padrão da escola."""
    doc = Document()

    # Configurar margens e duas colunas
    from docx.shared import Cm
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement
    for section in doc.sections:
        section.top_margin = Cm(2)
        section.bottom_margin = Cm(2)
        section.left_margin = Cm(2)
        section.right_margin = Cm(2)
        # Duas colunas
        sectPr = section._sectPr
        # Remover cols existente se houver
        for old_cols in sectPr.findall(qn('w:cols')):
            sectPr.remove(old_cols)
        cols = OxmlElement('w:cols')
        cols.set(qn('w:num'), '2')
        cols.set(qn('w:space'), '720')
        cols.set(qn('w:equalWidth'), '1')
        sectPr.append(cols)

    for i, q in enumerate(questoes):
        # ── ENUNCIADO ──
        para_enunc = doc.add_paragraph()
        set_paragraph_spacing(para_enunc, before=120 if i > 0 else 0, after=60)

        # Número da questão
        num_texto = f"{str(q.numero).zfill(2)}. "
        if q.referencia:
            num_texto += f"{q.referencia} "

        run_num = para_enunc.add_run(num_texto)
        run_num.bold = True
        run_num.font.size = Pt(11)
        run_num.font.name = 'Arial'

        # Texto do enunciado
        for tipo, conteudo in q.enunciado_parts:
            if tipo == 'texto':
                run = para_enunc.add_run(conteudo)
                run.bold = True
                run.font.size = Pt(11)
                run.font.name = 'Arial'

        # ── ALTERNATIVAS ──
        if q.alternativas:
            for letra, texto in q.alternativas:
                para_alt = doc.add_paragraph()
                set_paragraph_spacing(para_alt, before=20, after=20)
                para_alt.paragraph_format.left_indent = Pt(18)

                run_letra = para_alt.add_run(f"{letra}) ")
                run_letra.bold = False
                run_letra.font.size = Pt(11)
                run_letra.font.name = 'Arial'

                run_txt = para_alt.add_run(texto)
                run_txt.bold = False
                run_txt.font.size = Pt(11)
                run_txt.font.name = 'Arial'
        else:
            # Sem alternativas identificadas — adicionar espaço
            para_vazio = doc.add_paragraph()
            run = para_vazio.add_run("[Alternativas não identificadas automaticamente — revisar]")
            run.font.color.rgb = RGBColor(0xFF, 0x00, 0x00)
            run.font.size = Pt(10)
            run.italic = True

    return doc


def formatar_arquivo(input_path, output_path, simulado='', ano='2025'):
    """Função principal: lê o docx do professor e salva formatado."""
    doc_entrada = Document(input_path)
    questoes = parsear_questoes(doc_entrada)

    if not questoes:
        # Se não encontrou questões, apenas copia o documento
        doc_entrada.save(output_path)
        return 0

    doc_saida = gerar_documento_formatado(questoes, simulado, ano)
    doc_saida.save(output_path)
    return len(questoes)


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Uso: python formatar.py entrada.docx saida.docx [simulado] [ano]")
        sys.exit(1)

    entrada = sys.argv[1]
    saida = sys.argv[2]
    simulado = sys.argv[3] if len(sys.argv) > 3 else ''
    ano = sys.argv[4] if len(sys.argv) > 4 else '2025'

    n = formatar_arquivo(entrada, saida, simulado, ano)
    print(f"ok:{n}")
