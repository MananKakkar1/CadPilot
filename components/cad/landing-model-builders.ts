import type { CadModelId, CadModelValues } from './replicad-models';

type ReplicadApi = {
  makeBox: (corner1: [number, number, number], corner2: [number, number, number]) => any;
  makeCylinder: (radius: number, height: number, location?: [number, number, number], direction?: [number, number, number]) => any;
  makeSphere: (radius: number) => any;
};

const fuse = (shapes: any[]) => shapes.slice(1).reduce((result, shape) => result.fuse(shape), shapes[0]);

export function buildLandingShape(api: ReplicadApi, model: CadModelId, values: CadModelValues) {
  const { makeBox, makeCylinder, makeSphere } = api;

  if (model === 'spur-gear') {
    const outer = values.teeth * values.module * 0.55 + values.module;
    let shape = makeCylinder(outer, values.thickness);
    for (let index = 0; index < values.teeth; index += 1) {
      const angle = (index / values.teeth) * Math.PI * 2;
      const tooth = values.module * 0.9;
      const x = Math.cos(angle) * (outer - tooth / 2);
      const y = Math.sin(angle) * (outer - tooth / 2);
      shape = shape.fuse(makeBox([x - tooth / 2, y - tooth / 2, 0], [x + tooth / 2, y + tooth / 2, values.thickness]));
    }
    return shape.cut(makeCylinder(Math.max(values.bore * 0.32, outer * 0.28), values.thickness + 0.2, [0, 0, -0.1]));
  }

  if (model === 'phone-stand') {
    const width = values.width / 10;
    const height = values.height / 10;
    return fuse([
      makeBox([-width / 2, -3, 0], [width / 2, 3, 3]),
      makeBox([-width / 2, 0, 0], [width / 2, 3, height]),
      makeBox([-width / 2, 0, 0], [width / 2, height * 0.6, 3]),
    ]);
  }

  if (model === 'workbench-table') {
    const top = makeBox([-52, -32, 42], [52, 32, 48]);
    const apronFront = makeBox([-47, -30, 33], [47, -24, 42]);
    const apronBack = makeBox([-47, 24, 33], [47, 30, 42]);
    const apronLeft = makeBox([-50, -24, 33], [-44, 24, 42]);
    const apronRight = makeBox([44, -24, 33], [50, 24, 42]);
    const crossRail = makeBox([-44, -3, 17], [44, 3, 22]);
    const lowerShelf = makeBox([-38, -22, 12], [38, 22, 15]);
    const legs = [
      makeBox([-48, -28, 0], [-40, -20, 42]),
      makeBox([40, -28, 0], [48, -20, 42]),
      makeBox([-48, 20, 0], [-40, 28, 42]),
      makeBox([40, 20, 0], [48, 28, 42]),
    ];
    let table = fuse([top, apronFront, apronBack, apronLeft, apronRight, crossRail, lowerShelf, ...legs]);
    for (const x of [-40, 40]) for (const y of [-20, 20]) table = table.cut(makeCylinder(1.8, 9, [x, y, 40]));
    return table;
  }

  const feet = [
    makeBox([-22, -14, 0], [-5, 8, 8]),
    makeBox([5, -14, 0], [22, 8, 8]),
  ];
  const legs = [
    makeBox([-18, -8, 8], [-6, 4, 32]),
    makeBox([6, -8, 8], [18, 4, 32]),
  ];
  const pelvis = makeBox([-22, -12, 30], [22, 10, 40]);
  const torso = makeBox([-30, -15, 38], [30, 15, 72]);
  const head = makeBox([-23, -17, 70], [23, 17, 96]);
  const arms = [
    makeBox([-43, -11, 46], [-29, 9, 65]),
    makeBox([29, -11, 46], [43, 9, 65]),
    makeBox([-48, -8, 36], [-38, 6, 50]),
    makeBox([38, -8, 36], [48, 6, 50]),
  ];
  const eyes = [
    makeCylinder(5, 5, [-10, -20, 82], [0, 1, 0]),
    makeCylinder(5, 5, [10, -20, 82], [0, 1, 0]),
  ];
  const antenna = fuse([
    makeCylinder(2, 11, [0, 0, 96]),
    makeSphere(5).translate([0, 0, 108]),
  ]);
  let robot = fuse([...feet, ...legs, pelvis, torso, head, ...arms, ...eyes, antenna]);
  robot = robot.cut(makeBox([-15, -20, 75], [15, -10, 90]));
  return robot;
}
