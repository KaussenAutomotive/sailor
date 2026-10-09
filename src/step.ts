import { ShellSolid, Vec3 } from './shell';

// ISO 10303-21 (AP214) writer for faceted solids: every polygon becomes a planar ADVANCED_FACE,
// shared edges become one EDGE_CURVE so CAD systems read a closed MANIFOLD_SOLID_BREP.

export function stepReal(value: number, digits = 6): string {
  if (!Number.isFinite(value)) throw new Error('Ungültige Zahl im STEP-Export.');
  let text = value.toFixed(digits);
  if (/^-?0\.0+$/.test(text)) return '0.';
  text = text.replace(/0+$/, '');
  return text;
}

const stepString = (text: string) => `'${text.replace(/'/g, "''").replace(/[^\x20-\x7e]/g, c => ({ 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'Ä': 'Ae', 'Ö': 'Oe', 'Ü': 'Ue', 'ß': 'ss' } as Record<string, string>)[c] ?? '_')}'`;

const subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const normalize = (a: Vec3): Vec3 => { const l = length(a); return [a[0] / l, a[1] / l, a[2] / l]; };

export interface StepOptions { name: string; timestamp?: string; transform?: (p: Vec3) => Vec3 }

export function writeStep(solids: ShellSolid[], options: StepOptions): string {
  const lines: string[] = [];
  let id = 0;
  const add = (entity: string) => { id += 1; lines.push(`#${id}=${entity};`); return id; };
  const transform = options.transform ?? ((p: Vec3) => p);
  const point = (p: Vec3) => add(`CARTESIAN_POINT('',(${p.map(v => stepReal(v)).join(',')}))`);
  const direction = (d: Vec3) => add(`DIRECTION('',(${d.map(v => stepReal(v, 9)).join(',')}))`);

  const context = add("APPLICATION_CONTEXT('automotive design')");
  add(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,#${context})`);
  const productContext = add(`PRODUCT_CONTEXT('',#${context},'mechanical')`);
  const product = add(`PRODUCT(${stepString(options.name)},${stepString(options.name)},'',(#${productContext}))`);
  add(`PRODUCT_RELATED_PRODUCT_CATEGORY('part',$,(#${product}))`);
  const formation = add(`PRODUCT_DEFINITION_FORMATION('','',#${product})`);
  const definitionContext = add(`PRODUCT_DEFINITION_CONTEXT('part definition',#${context},'design')`);
  const definition = add(`PRODUCT_DEFINITION('design','',#${formation},#${definitionContext})`);
  const shapeDefinition = add(`PRODUCT_DEFINITION_SHAPE('','',#${definition})`);
  const lengthUnit = add('(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.))');
  const angleUnit = add('(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.))');
  const solidAngleUnit = add('(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT())');
  const uncertainty = add(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-03),#${lengthUnit},'distance_accuracy_value','confusion accuracy')`);
  const geometricContext = add(`(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#${uncertainty}))GLOBAL_UNIT_ASSIGNED_CONTEXT((#${lengthUnit},#${angleUnit},#${solidAngleUnit}))REPRESENTATION_CONTEXT('Context3D','3D Context with 0.001 mm uncertainty'))`);
  const origin = add(`AXIS2_PLACEMENT_3D('',#${point([0, 0, 0])},#${direction([0, 0, 1])},#${direction([1, 0, 0])})`);

  const breps = solids.map(solid => {
    const vertices = solid.vertices.map(v => transform(v));
    const vertexIds = new Map<number, number>();
    const vertexId = (index: number) => {
      let existing = vertexIds.get(index);
      if (existing === undefined) {
        existing = add(`VERTEX_POINT('',#${point(vertices[index])})`);
        vertexIds.set(index, existing);
      }
      return existing;
    };
    const edges = new Map<string, number>();
    const edgeId = (a: number, b: number) => {
      const [lo, hi] = a < b ? [a, b] : [b, a];
      const key = `${lo}:${hi}`;
      let existing = edges.get(key);
      if (existing === undefined) {
        const delta = subtract(vertices[hi], vertices[lo]);
        const size = length(delta);
        if (size < 1e-9) throw new Error('Entartete Kante im STEP-Export.');
        const vector = add(`VECTOR('',#${direction(normalize(delta))},${stepReal(size)})`);
        const line = add(`LINE('',#${point(vertices[lo])},#${vector})`);
        existing = add(`EDGE_CURVE('',#${vertexId(lo)},#${vertexId(hi)},#${line},.T.)`);
        edges.set(key, existing);
      }
      return { id: existing, forward: a === lo };
    };
    const faces = solid.faces.map(loop => {
      const n: Vec3 = [0, 0, 0];
      loop.forEach((index, k) => {
        const a = vertices[index];
        const b = vertices[loop[(k + 1) % loop.length]];
        n[0] += (a[1] - b[1]) * (a[2] + b[2]);
        n[1] += (a[2] - b[2]) * (a[0] + b[0]);
        n[2] += (a[0] - b[0]) * (a[1] + b[1]);
      });
      const normal = normalize(n);
      const firstEdge = subtract(vertices[loop[1]], vertices[loop[0]]);
      const reference = normalize(cross(cross(normal, firstEdge), normal));
      const oriented = loop.map((index, k) => {
        const edge = edgeId(index, loop[(k + 1) % loop.length]);
        return add(`ORIENTED_EDGE('',*,*,#${edge.id},${edge.forward ? '.T.' : '.F.'})`);
      });
      const edgeLoop = add(`EDGE_LOOP('',(${oriented.map(e => `#${e}`).join(',')}))`);
      const bound = add(`FACE_OUTER_BOUND('',#${edgeLoop},.T.)`);
      const placement = add(`AXIS2_PLACEMENT_3D('',#${point(vertices[loop[0]])},#${direction(normal)},#${direction(reference)})`);
      const plane = add(`PLANE('',#${placement})`);
      return add(`ADVANCED_FACE('',(#${bound}),#${plane},.T.)`);
    });
    const shell = add(`CLOSED_SHELL('',(${faces.map(f => `#${f}`).join(',')}))`);
    return add(`MANIFOLD_SOLID_BREP(${stepString(solid.name)},#${shell})`);
  });
  const representation = add(`ADVANCED_BREP_SHAPE_REPRESENTATION(${stepString(options.name)},(#${origin},${breps.map(b => `#${b}`).join(',')}),#${geometricContext})`);
  add(`SHAPE_DEFINITION_REPRESENTATION(#${shapeDefinition},#${representation})`);

  const timestamp = options.timestamp ?? new Date().toISOString().slice(0, 19);
  return [
    'ISO-10303-21;',
    'HEADER;',
    "FILE_DESCRIPTION(('Sailor Studio Rumpfschale'),'2;1');",
    `FILE_NAME(${stepString(`${options.name}.step`)},'${timestamp}',('Sailor Studio'),(''),'Sailor Studio','Sailor Studio','');`,
    "FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));",
    'ENDSEC;',
    'DATA;',
    ...lines,
    'ENDSEC;',
    'END-ISO-10303-21;',
    '',
  ].join('\n');
}

// Model coordinates (m, x forward, y up, z starboard) → CAD (mm, X from transom forward, Y port, Z up).
export function cadTransform(xStern: number) {
  return (p: Vec3): Vec3 => [(p[0] - xStern) * 1000, -p[2] * 1000, p[1] * 1000];
}
