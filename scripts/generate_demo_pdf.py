from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "avaliacao-modelo.pdf"
PUBLIC = ROOT / "public" / "generated" / "avaliacao-modelo.pdf"
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
PUBLIC.parent.mkdir(parents=True, exist_ok=True)

navy = colors.HexColor("#10233F")
blue = colors.HexColor("#1D5FD1")
lime = colors.HexColor("#C9EF57")
slate = colors.HexColor("#526174")
line = colors.HexColor("#DCE3EC")
paper = colors.HexColor("#F7F9FC")

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="Brand", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=9, textColor=blue, leading=12, spaceAfter=4))
styles.add(ParagraphStyle(name="ExamTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=18, textColor=navy, alignment=TA_CENTER, leading=22, spaceAfter=4))
styles.add(ParagraphStyle(name="Meta", parent=styles["Normal"], fontSize=9, textColor=slate, alignment=TA_CENTER, leading=13))
styles.add(ParagraphStyle(name="Question", parent=styles["BodyText"], fontSize=10.5, leading=16, textColor=navy, spaceAfter=7))
styles.add(ParagraphStyle(name="Choice", parent=styles["BodyText"], fontSize=10, leading=15, leftIndent=7 * mm, textColor=navy))
styles.add(ParagraphStyle(name="Small", parent=styles["Normal"], fontSize=8, leading=11, textColor=slate))
styles.add(ParagraphStyle(name="Key", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=13, textColor=navy, spaceAfter=8))

questions = [
    ("Em um sistema fechado, 12 g de carbono reagem completamente com 32 g de oxigênio. Qual massa de produto deve ser obtida?", ["20 g", "32 g", "44 g", "56 g"], "C", "EM13CNT101", "Conservação da matéria: 12 g + 32 g = 44 g."),
    ("Qual representação descreve melhor um átomo eletricamente neutro?", ["Prótons em número igual ao de elétrons", "Somente nêutrons no núcleo", "Elétrons sem núcleo", "Mais prótons que elétrons"], "A", "EM13CNT104", "A neutralidade decorre da igualdade entre cargas positivas e negativas."),
    ("Uma amostra apresenta ponto de fusão constante. Essa observação é um indício de:", ["mistura heterogênea", "substância pura", "suspensão", "reação incompleta"], "B", "EM13CNT104", "Substâncias puras apresentam propriedades físicas características."),
]

def decorate(canvas, doc):
    canvas.saveState()
    width, height = A4
    canvas.setFillColor(navy)
    canvas.rect(0, height - 12 * mm, width, 12 * mm, stroke=0, fill=1)
    canvas.setFillColor(lime)
    canvas.circle(17 * mm, height - 6 * mm, 2.3 * mm, stroke=0, fill=1)
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 9)
    canvas.drawString(23 * mm, height - 8 * mm, "CADERNO | AVALIAÇÕES BNCC")
    canvas.setStrokeColor(line)
    canvas.line(18 * mm, 15 * mm, width - 18 * mm, 15 * mm)
    canvas.setFillColor(slate)
    canvas.setFont("Helvetica", 8)
    canvas.drawString(18 * mm, 10 * mm, "Colégio Horizonte - Documento demonstrativo")
    canvas.drawRightString(width - 18 * mm, 10 * mm, f"Pagina {doc.page}")
    canvas.restoreState()

story = [
    Paragraph("AVALIAÇÃO BIMESTRAL", styles["Brand"]),
    Paragraph("Química - 1ª série", styles["ExamTitle"]),
    Paragraph("Versão A | Valor: 3,0 pontos | Tempo sugerido: 50 minutos", styles["Meta"]),
    Spacer(1, 7 * mm),
]

identity = Table([["Nome: __________________________________________", "Turma: __________"], ["Numero: __________", "Data: ____/____/________"]], colWidths=[110 * mm, 55 * mm], rowHeights=[9 * mm, 9 * mm])
identity.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), .7, line), ("INNERGRID", (0, 0), (-1, -1), .5, line), ("BACKGROUND", (0, 0), (-1, -1), paper), ("TEXTCOLOR", (0, 0), (-1, -1), navy), ("FONT", (0, 0), (-1, -1), "Helvetica", 9), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 8)]))
story.extend([identity, Spacer(1, 6 * mm), Paragraph("Leia cada questão com atenção e marque apenas uma alternativa.", styles["Small"]), Spacer(1, 6 * mm)])

for index, (statement, choices, answer, skill, explanation) in enumerate(questions, 1):
    story.append(Paragraph(f"<b>{index}.</b> {statement}", styles["Question"]))
    for letter, choice in zip("ABCD", choices):
        story.append(Paragraph(f"<b>{letter})</b> {choice}", styles["Choice"]))
    story.extend([Spacer(1, 2 * mm), Paragraph(f"Habilidade: {skill}", styles["Small"]), Spacer(1, 6 * mm)])

story.extend([PageBreak(), Paragraph("DOCUMENTO DO PROFESSOR", styles["Brand"]), Paragraph("Gabarito comentado", styles["ExamTitle"]), Paragraph("Química - 1ª série | Versão A", styles["Meta"]), Spacer(1, 10 * mm)])
key_data = [["Questão", "Resposta", "Habilidade", "Justificativa"]]
for index, (_, _, answer, skill, explanation) in enumerate(questions, 1):
    key_data.append([str(index), answer, skill, Paragraph(explanation, styles["Small"])])
key = Table(key_data, colWidths=[20 * mm, 22 * mm, 32 * mm, 91 * mm], repeatRows=1)
key.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), navy), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 8), ("ALIGN", (0, 0), (1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("GRID", (0, 0), (-1, -1), .6, line), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, paper]), ("FONT", (0, 1), (2, -1), "Helvetica", 9), ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
story.extend([key, Spacer(1, 8 * mm), Paragraph("Integridade do gabarito", styles["Key"]), Paragraph("As letras acima foram calculadas a partir das chaves estáveis das alternativas. Em outra versão, a letra pode mudar, mas a alternativa correta continua vinculada ao mesmo identificador no banco.", styles["Question"])])

doc = SimpleDocTemplate(str(OUTPUT), pagesize=A4, rightMargin=18 * mm, leftMargin=18 * mm, topMargin=22 * mm, bottomMargin=22 * mm, title="Avaliação modelo - Química", author="Caderno BNCC")
doc.build(story, onFirstPage=decorate, onLaterPages=decorate)
PUBLIC.write_bytes(OUTPUT.read_bytes())
print(OUTPUT)
