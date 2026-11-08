export default function AI() {
  const items = [
    ["Gerar board a partir do objetivo", "Descreva o processo e a IA monta fases, campos e regras."],
    ["Resumo do card e da conversa", "Resumo automático do card e do histórico no Domma Chat."],
    ["Próxima ação sugerida", "O que fazer com o lead agora, com base nas respostas e no tempo parado."],
    ["Temperatura do lead", "Quente, morno ou frio, calculado pelas respostas."],
    ["Alerta de carteira parada", "Avisa quando cards ficam sem movimentação."],
    ["Perguntas sobre o funil", "“Quantos leads da Royal em SP este mês?”"],
  ];
  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-8">
      <h1 className="text-[22px] font-bold">Domma <span className="text-brand">IA</span></h1>
      <p className="mt-1 text-sm text-ink-3">Planejado para a Fase 3 da especificação. Provedores configuráveis com reserva, como no Domma Chat.</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {items.map(([t, d]) => <div key={t} className="rounded-[16px] bg-lilac p-4"><div className="font-bold text-action">✦ {t}</div><div className="mt-1 text-sm text-ink-2">{d}</div></div>)}
      </div>
    </div>
  );
}
