import {
  ArrowRight,
  BookOpen,
  Building2,
  CheckCircle2,
  ExternalLink,
  Gauge,
  LayoutDashboard,
  MessageCircle,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
} from 'lucide-react';

import { HOME_COURSES } from '../../data/homeCourses';
import {
  AUDIENCE_HIGHLIGHTS,
  PROGRAM_DELIVERABLES,
  PROGRAM_FAQ,
  PROGRAM_INFO_CARDS,
  PROGRAM_METRICS,
  PROGRAM_OBJECTIVES,
} from '../../data/homeInstitutional';

import './HomePage.css';

export function HomePage({ onNavigate }) {
  return (
    <div className="home-page">
      <section className="home-hero panel">
        <div className="home-hero-copy">
          <span className="section-kicker">Pronatec Empreender 2025</span>
          <h2>
            Qualificação profissional para economia digital, inovação tecnológica e
            empreendedorismo.
          </h2>
          <p>
            O Pronatec Empreender é um projeto de apoio técnico e pedagógico aos cursos do Pronatec,
            com foco em gestão pedagógica moderna, empregabilidade, permanência dos estudantes e
            fortalecimento das ofertas em áreas estratégicas.
          </p>

          <div className="home-actions">
            <button type="button" onClick={() => onNavigate('reports')}>
              <BookOpen size={18} aria-hidden="true" />
              Relatório da Turma
            </button>
            <button
              className="secondary-action"
              type="button"
              onClick={() => onNavigate('participants')}
            >
              <Users size={18} aria-hidden="true" />
              Cadastro de Participantes
            </button>
            <button type="button" onClick={() => onNavigate('validate')}>
              <Search size={18} aria-hidden="true" />
              Consulta de interessados
            </button>

            <button
              className="secondary-action"
              type="button"
              onClick={() => onNavigate('dashboard')}
            >
              <LayoutDashboard size={18} aria-hidden="true" />
              Acessar Mapeamento de Alunos
            </button>

            <button
              className="secondary-action"
              type="button"
              onClick={() => onNavigate('secondaryDashboard')}
            >
              <Building2 size={18} aria-hidden="true" />
              Coordenação
            </button>
          </div>
        </div>

        <div className="home-visual" aria-label="Resumo institucional do programa">
          <div className="orbit-card main">
            <Sparkles size={28} />
            <div>
              <strong>3 cursos estratégicos</strong>
              <span>IA, drones, impressão 3D e desenvolvimento ágil de aplicativos.</span>
            </div>
          </div>

          <div className="orbit-card one">IA</div>
          <div className="orbit-card two">3D</div>
          <div className="orbit-card three">Apps</div>
        </div>
      </section>

      <section className="home-stats" aria-label="Indicadores do Pronatec Empreender">
        {PROGRAM_METRICS.map((metric) => (
          <HomeStat value={metric.value} label={metric.label} key={metric.label} />
        ))}
      </section>

      <section className="home-overview-grid">
        <article className="home-panel panel">
          <header>
            <ShieldCheck size={20} aria-hidden="true" />
            <h2>O que é o Pronatec Empreender?</h2>
          </header>

          <p>
            É uma ação vinculada ao Programa Nacional de Acesso ao Ensino Técnico e Emprego, voltada
            à modernização da formação profissional e ao apoio das instituições executoras na oferta
            de cursos gratuitos, presenciais e de curta duração.
          </p>

          <div className="info-card-grid">
            {PROGRAM_INFO_CARDS.map((item) => (
              <div className="info-card" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="home-panel panel">
          <header>
            <Users size={20} aria-hidden="true" />
            <h2>Público-alvo e participação</h2>
          </header>

          <p>
            As ofertas são disponibilizadas pelas instituições contempladas por meio de editais
            públicos de seleção, seguindo as orientações nacionais do programa.
          </p>

          <div className="audience-list">
            {AUDIENCE_HIGHLIGHTS.map((item) => (
              <div key={item}>
                <CheckCircle2 size={18} aria-hidden="true" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="home-grid">
        <article className="home-panel panel">
          <header>
            <BookOpen size={20} aria-hidden="true" />
            <h2>Cursos ofertados</h2>
          </header>

          <div className="course-list">
            {HOME_COURSES.map((course) => (
              <div className="course-card" key={course.title}>
                <strong>{course.title}</strong>
                <p>{course.text}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="home-panel panel">
          <header>
            <Target size={20} aria-hidden="true" />
            <h2>Objetivos do programa</h2>
          </header>

          <div className="policy-list">
            {PROGRAM_OBJECTIVES.map((objective, index) => (
              <div key={objective}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <p>{objective}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="home-panel panel">
        <header>
          <Gauge size={20} aria-hidden="true" />
          <h2>Entregas pedagógicas e apoio à execução</h2>
        </header>

        <div className="deliverables-grid">
          {PROGRAM_DELIVERABLES.map((deliverable) => (
            <div className="deliverable-card" key={deliverable}>
              <CheckCircle2 size={18} aria-hidden="true" />
              <span>{deliverable}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="management-callout panel">
        <div>
          <span className="section-kicker">Gestão e acompanhamento</span>
          <h2>Indicadores para tomada de decisão</h2>
          <p>
            Além da consulta pública de interessados, o portal reúne dashboards administrativos para
            acompanhamento das inscrições, distribuição territorial, perfil dos participantes e
            dados agregados das instituições ofertantes.
          </p>
        </div>

        <div className="management-actions">
          <button type="button" onClick={() => onNavigate('dashboard')}>
            Dashboard SETEC
            <ArrowRight size={17} aria-hidden="true" />
          </button>

          <button
            className="secondary-action"
            type="button"
            onClick={() => onNavigate('secondaryDashboard')}
          >
            Dashboard Coordenação
            <ArrowRight size={17} aria-hidden="true" />
          </button>
        </div>
      </section>

      <section className="home-panel panel faq-section">
        <header>
          <ShieldCheck size={20} aria-hidden="true" />
          <h2>Perguntas frequentes</h2>
        </header>

        <div className="faq-grid">
          {PROGRAM_FAQ.map((item) => (
            <details className="faq-item" key={item.question}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="community-card panel">
        <div>
          <span className="section-kicker">Comunidade</span>
          <h2>Entre na comunidade do WhatsApp</h2>
          <p>
            A comunidade concentra avisos, comunicados e orientações relacionadas ao Pronatec
            Empreender, facilitando o acompanhamento das informações pelos participantes.
          </p>
        </div>

        <a
          className="whatsapp-button"
          href="https://chat.whatsapp.com/BQucupAq2TNEfGKkrdkhRi"
          target="_blank"
          rel="noreferrer"
        >
          <MessageCircle size={18} aria-hidden="true" />
          Entrar na comunidade
          <ExternalLink size={15} aria-hidden="true" />
        </a>
      </section>

      <section className="source-note contacts-note">
        <p>Contatos do projeto:</p>

        <ul>
          <li>
            <strong>Prof. Carlos Hairon</strong> (IFCE) ·{' '}
            <a href="mailto:hairon@ifce.edu.br">hairon@ifce.edu.br</a>
          </li>
          <li>
            <strong>Prof. Vinícius Calou</strong> (IFCE) ·{' '}
            <a href="mailto:vinicius.calou@ifce.edu.br">vinicius.calou@ifce.edu.br</a>
          </li>
          <li>
            <strong>Prof. Stelio Bastos</strong> (IFCE) ·{' '}
            <a href="mailto:stelio.bastos@ifce.edu.br">stelio.bastos@ifce.edu.br</a>
          </li>
        </ul>
      </section>
    </div>
  );
}

function HomeStat({ value, label }) {
  return (
    <article className="home-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}
