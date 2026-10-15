import { INSTITUTIONS, COURSES } from '@pronatec/shared';
export function ClassFields({ value, onChange, disabled = false, prefix = 'class' }) {
  const update = (event) => onChange({ ...value, [event.target.name]: event.target.value });
  return (
    <fieldset className="intake-grid" disabled={disabled}>
      <legend>Identificação da turma</legend>
      <label htmlFor={`${prefix}-institution`}>
        Instituição
        <select
          id={`${prefix}-institution`}
          name="institution"
          value={value.institution || ''}
          onChange={update}
          required
        >
          <option value="">Selecione</option>
          {INSTITUTIONS.map((i) => (
            <option key={i}>{i}</option>
          ))}
        </select>
      </label>
      <label htmlFor={`${prefix}-campus`}>
        Campus
        <input
          id={`${prefix}-campus`}
          name="campus"
          value={value.campus || ''}
          onChange={update}
          maxLength={120}
          required
        />
      </label>
      <label className="intake-wide" htmlFor={`${prefix}-course`}>
        Curso
        <select
          id={`${prefix}-course`}
          name="course"
          value={value.course || ''}
          onChange={update}
          required
        >
          <option value="">Selecione</option>
          {COURSES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
    </fieldset>
  );
}
