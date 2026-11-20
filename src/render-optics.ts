import { Filter } from 'pixi.js';

// Applied only to the primary specimen's tight bounds, at reduced resolution.
export function createRefraction() {
  return Filter.from({
    resolution: .72,
    padding: 9,
    gl: {
      vertex: `
        in vec2 aPosition;
        out vec2 vTextureCoord;
        uniform mediump vec4 uInputSize;
        uniform vec4 uOutputFrame;
        uniform vec4 uOutputTexture;

        void main() {
          vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
          position.x = position.x * 2.0 / uOutputTexture.x - 1.0;
          position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
          gl_Position = vec4(position, 0.0, 1.0);
          vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
        }
      `,
      fragment: `
        in vec2 vTextureCoord;
        out vec4 finalColor;
        uniform sampler2D uTexture;
        uniform mediump vec4 uInputSize;
        uniform vec4 uInputClamp;
        uniform float uSeconds;
        uniform float uStress;

        vec4 sampleCell(vec2 uv) {
          return texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));
        }

        void main() {
          vec2 uv = vTextureCoord;
          vec2 waves = vec2(
            sin(uv.y * 18.0 + uSeconds * 1.16 + sin(uv.x * 12.0 - uSeconds * .5)),
            sin(uv.x * 20.0 - uSeconds * .81 + cos(uv.y * 10.0 + uSeconds * .7))
          );
          vec2 origin = uv + waves * (.004 + .004 * uStress);
          vec4 cell = sampleCell(origin);
          vec2 spread = uInputSize.zw * 2.5;
          vec4 b1 = sampleCell(origin + vec2(spread.x, 0.0));
          vec4 b2 = sampleCell(origin - vec2(spread.x, 0.0));
          vec4 b3 = sampleCell(origin + vec2(0.0, spread.y));
          vec4 b4 = sampleCell(origin - vec2(0.0, spread.y));
          vec3 halo = (b1.rgb + b2.rgb + b3.rgb + b4.rgb) * .062;
          float a = min(1.0, cell.a + (b1.a + b2.a + b3.a + b4.a) * .034);
          vec3 fringe = vec3(b1.r - cell.r, 0.0, b2.b - cell.b) * .12;
          vec3 glint = vec3(.06, .12, .09) * uStress * cell.a;
          finalColor = vec4(min(vec3(a), cell.rgb + (halo + fringe) * (1.0 - cell.a * .43) + glint), a);
        }
      `,
    },
    resources: {
      refraction: {
        uSeconds: { value: 0, type: 'f32' },
        uStress: { value: 0, type: 'f32' },
      },
    },
  });
}
