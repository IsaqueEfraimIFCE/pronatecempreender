import { BarChart3, Database, Gauge, MapPin, Users } from 'lucide-react';

import { GenericChartPanel } from '../../components/charts/GenericChartPanel/GenericChartPanel';
import { OfferCalendar } from '../../components/charts/OfferCalendar/OfferCalendar';
import { StatePanel } from '../../components/feedback/StatePanel';
import { MetricCard } from '../../components/ui/MetricCard';
import { CHART_HELP } from '../../data/chartHelp';
import { firstItem } from '../../utils/chartUtils';

export function SecondaryDashboardContent({ summary }) {
  const metrics = summary.metrics || [];
  const charts = summary.charts || [];

  const scheduleChart = charts.find((chart) => chart.id === 'starts-by-month');
  const otherCharts = charts.filter((chart) => chart.id !== 'starts-by-month');
  const chartTitleOverrides = {
  'Ofertas por região': 'Turmas iniciadas por região',
  'Vagas por região': 'Vagas em turmas já iniciadas por região',
  'Ranking de instituições por vagas': 'Ranking de instituições por vagas pactuadas',
  'Campi por instituição': 'Quantidade de turmas por instituição',
};

const normalizedOtherCharts = otherCharts.map((chart) => ({
  ...chart,
  title: chartTitleOverrides[chart.title] || chart.title,
}));
  const totalRecords = summary.totalRecords || summary.totalResponses || 0;
  const primaryMetric = firstItem(metrics);
  const secondaryMetric = metrics[1];
  const tertiaryMetric = metrics[2];

  return (
    <div className="dashboard-content">
      <section className="metric-grid">
        <MetricCard icon={Database} label="Registros analisados" value={totalRecords} />
        <MetricCard icon={Gauge} label={primaryMetric?.label || 'Indicador principal'} value={primaryMetric?.value || 'A definir'} />
        <MetricCard icon={Users} label={secondaryMetric?.label || 'Público observado'} value={secondaryMetric?.value || 'A definir'} />
        <MetricCard icon={MapPin} label={tertiaryMetric?.label || 'Recorte territorial'} value={tertiaryMetric?.value || 'A definir'} />
      </section>

      {scheduleChart ? (
        <section className="dashboard-feature-grid">
          <OfferCalendar
            title={'Início das ofertas por campi'}
            icon={BarChart3}
            items={scheduleChart.items || []}
            featured
            help={scheduleChart.help || CHART_HELP.secondaryStartsByMonth}
          />
        </section>
      ) : null}

      {normalizedOtherCharts.length ? (
        <section className="dashboard-grid">
          {normalizedOtherCharts.map((chart, index) => (
            <GenericChartPanel chart={chart} index={index} key={chart.id || chart.title || index} />
          ))}
        </section>
      ) : (
        <StatePanel
          tone="neutral"
          icon={BarChart3}
          title="Sem indicadores configurados"
          text="A conexão respondeu, mas ainda não trouxe gráficos para esta planilha de acompanhamento."
        />
      )}
    </div>
  );
}
