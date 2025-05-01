import * as THREE from "three";

export function createSplatMaterial(
  size: number,
  fade: number = 1.0,
  splatStyle: "solidFlat" | "solidFancy" = "solidFancy"
): THREE.ShaderMaterial {
  let fragmentShader = ``;

  if (splatStyle === "solidFlat") {
    fragmentShader = `
      uniform float fade;
      uniform float lodFade;
      varying vec3 vColor;

      void main() {
        gl_FragColor = vec4(vColor, fade * lodFade);
      }
    `;
  } else {
    fragmentShader = `
      uniform float fade;
      uniform float lodFade;
      varying vec3 vColor;

      void main() {
        vec2 coord = gl_PointCoord - vec2(0.5);
        float d = length(coord);
        float edge = fwidth(d);
        float alpha = 1.0 - smoothstep(0.45 - edge, 0.5 + edge, d);
        alpha *= 0.5 + 0.5 * (1.0 - d);
        vec3 shadedColor = mix(vColor * 0.7, vColor, 1.0 - d);
        if (d > 0.5) discard;
        gl_FragColor = vec4(shadedColor, alpha * fade * lodFade);
      }
    `;
  }

  return new THREE.ShaderMaterial({
    uniforms: {
      size: { value: size },
      fade: { value: fade },
      lodFade: { value: 1.0 },
    },
    vertexColors: true,
    vertexShader: `
      uniform float size;
      varying vec3 vColor;

      void main() {
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float dist = length(mvPosition.xyz);
        // Clamp the point size for stability
        gl_PointSize = clamp(size * (200.0 / dist), 1.0, 5.0);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader,
    transparent: true,
    depthWrite: splatStyle === "solidFlat",
    depthTest: true,
    blending: splatStyle === "solidFlat"
      ? THREE.NoBlending
      : THREE.NormalBlending,
  });
}
