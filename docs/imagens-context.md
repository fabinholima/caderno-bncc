# Imagens PNG/JPG no ConTeXt

Use o upload de imagem já existente na barra do editor. Posicione o cursor antes do upload: o editor insere uma referência no ponto escolhido e mantém o arquivo anexado ao campo.

```tex
Texto antes da imagem.
\externalfigure[imagem1][width=8cm]
Texto depois da imagem.
```

A referência aparece no cartão da imagem, junto do botão **Inserir referência no texto**. Esse botão utiliza a última posição do cursor no editor. Ajuste `width=8cm`, ou use `width=\textwidth` para ocupar a largura disponível. Você também pode mover ou copiar o comando dentro do mesmo campo.

As referências são locais ao campo: enunciado, alternativa ou resolução. Anexe a figura no campo em que pretende utilizá-la. PNG e JPEG permanecem limitados a 400 KB, como antes.

Quando a figura tem uma referência no código, ela é impressa somente na posição do comando. As figuras antigas, sem referência no código, mantêm a apresentação automática. A legenda automática acompanha apenas a apresentação automática; ao posicionar manualmente, escreva a legenda no ponto desejado do ConTeXt.

O nome `imagem1` é um identificador do arquivo enviado; não é um caminho do servidor. Antes da compilação, o worker substitui o identificador por um arquivo local gerado para o PDF. Referência a imagem não anexada gera erro explícito. O identificador é preservado no cadastro e na edição. Não há migração SQL; o identificador fica no JSON do bloco de imagem existente.
