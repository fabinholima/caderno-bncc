# Receita e gestão de assinantes

Aplicar a migração 047 antes de iniciar a API atualizada. A seção Receita e assinantes e seus endpoints exigem administrador geral autenticado; editores e professores não têm acesso.

Relatório: 12 meses, filtro por ano, fuso America/Campo_Grande, valores em centavos inteiros. A receita bruta usa a data de aprovação de cada pagamento. Assinantes pagantes são instituições distintas com pagamento no mês (o contrato de cobrança pertence à instituição). Não é uma contagem de professores nem de assinaturas atualmente ativas. Pagamentos posteriormente estornados permanecem na receita bruta; os estornos são subtraídos separadamente.

O webhook registra aumentos no valor cumulativo estornado, de modo idempotente, inclusive estornos parciais e chargebacks. A data mensal do estorno é a data em que o servidor recebeu sua confirmação, não a data original bancária. Pagamentos históricos estornados sem valor reconciliado geram aviso de incompletude; não se inventam datas ou valores. Taxas e impostos não são deduzidos. O painel não simula pagamentos e não ativa a integração Mercado Pago.

Bloqueio e exclusão lógica desativam a conta e encerram sessões. Restauração é explícita. Dados financeiros e histórico permanecem. Nenhuma dessas operações cancela cobranças no provedor; esse aviso é mostrado antes da confirmação. Administradores e a própria conta não podem ser bloqueados ou excluídos por esse fluxo.

Sessões: registrar IP de origem TCP e User-Agent limitado a 512 caracteres no próximo acesso autenticado; ignorar X-Forwarded-For não confiável. Atrás de proxy será mostrado o IP do proxy até existir configuração validada. O filtro aceita IP exato IPv4/IPv6 em sessões não expiradas. Não há fingerprint de hardware, bloqueio por IP ou monitoramento retroativo. IP e navegador são dados aproximados, não prova de identidade. Política de retenção de sessões/IP e aviso de privacidade devem ser definidos antes de publicação.

Aplicativo móvel: projeto em app-mobile-correcao.md; ainda não implementado/publicado.
