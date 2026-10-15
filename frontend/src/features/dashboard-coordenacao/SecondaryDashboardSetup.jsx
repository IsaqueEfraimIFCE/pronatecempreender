import { BarChart3, Database, ShieldCheck } from 'lucide-react';

export function SecondaryDashboardSetup() {
  return (
    <section className="setup-panel panel">
      <div>
        <span className="section-kicker">Acompanhamento da coordenação</span>
        <h2>Indicadores dos institutos cadastrados</h2>
        <p>
          Use este painel para acompanhar a distribuição de vagas, cursos, instituições participantes, regiões atendidas
          e situação do cronograma informado pelos institutos.
        </p>
      </div>

      <div className="setup-grid">
        <div>
          <Database size={20} aria-hidden="true" />
          <strong>Fonte</strong>
          <span>Tabela principal de institutos, campi, cursos e vagas</span>
        </div>

        <div>
          <ShieldCheck size={20} aria-hidden="true" />
          <strong>Acesso</strong>
          <span>Consulta protegida por código de acesso</span>
        </div>

        <div>
          <BarChart3 size={20} aria-hidden="true" />
          <strong>Indicadores</strong>
          <span>Cards, rankings, roscas, barras e distribuições</span>
        </div>
      </div>
    </section>
  );
}