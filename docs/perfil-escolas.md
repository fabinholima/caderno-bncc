# Perfil profissional e escolas

Aplicar migração 044 após 043. Contas novas (senha ou Google) e existentes passam pela conclusão de perfil após o CPF. Sem perfil e escola, a API retorna 428 para os recursos do portal; continuam disponíveis identificação, saída e preenchimento de perfil.

Professor informa disciplinas e séries; coordenador informa etapas. Telefone pessoal é opcional. Escola informa nome, rede/tipo, endereço, município/UF; CNPJ quando aplicável, INEP, CEP, telefone, e-mail e logotipo são opcionais. Identificadores da escola são declaratórios: não há consulta a cadastro oficial ou verificação de titularidade nesta etapa.

GET/POST /api/educator-profile usam exclusivamente o usuário da sessão. Escola pode ser adicionada ou editada pelo proprietário (até 30 escolas). São registros pessoais para cabeçalhos, não cadastros verificados de organizações. Não aparecem para outros usuários, não criam memberships e não conferem autorização de coordenador/admin em bancos compartilhados. Convites institucionais existentes continuam sendo o caminho para concessão de acesso. O criador da conta administra apenas seu espaço pessoal.

Em Configurações → Meu perfil e minhas escolas é possível editar o perfil e adicionar outras escolas. Na montagem da avaliação, escolher Escola cadastrada para o cabeçalho preenche nome — município/UF, logotipo e nome do usuário como professor (editável). Disciplina/turma/data continuam nas configurações da avaliação. Não imprimir CPF, telefone, e-mail, CNPJ ou endereço pessoal no cabeçalho.

POST /api/assessments aceita schoolId opcional; o servidor valida a propriedade e copia os dados da escola para o snapshot imutável. Alterar a escola posteriormente não muda provas já geradas. Editar manualmente o nome/logotipo ou carregar um favorito volta ao modo de cabeçalho personalizado, sem schoolId.

Não há aprovação automática de vínculo institucional nem diretório público de escolas nesta etapa. O papel profissional declarado é distinto das permissões de acesso.
