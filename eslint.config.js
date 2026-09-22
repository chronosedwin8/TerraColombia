import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';
import globals from 'globals';

export default [
  { ignores: ['**/dist/**', '**/node_modules/**', '**/.turbo/**', 'data-catalog/**', 'data/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          // `const { clave: _descartada, ...resto } = fila` es la forma idiomática de
          // quitar una clave de un objeto. Sin esto, la variable intermedia se marca como
          // no usada y obliga a silenciar la regla en cada sitio donde se usa el patrón.
          ignoreRestSiblings: true,
        },
      ],
      'no-console': 'off',
    },
  },

  /*
   * El frontend corre en el navegador: `window`, `document`, `setTimeout` y compañía son
   * globales legítimas ahí. Sin declararlas, `no-undef` las marcaba como errores en cuanto
   * el lint empezó a mirar los `.vue`, que es ruido que tapa los hallazgos de verdad.
   */
  {
    files: ['apps/web/**/*.{ts,vue}'],
    languageOptions: { globals: globals.browser },
  },

  /* El backend y las herramientas corren en Node. */
  {
    files: ['apps/api/**/*.ts', 'apps/worker/**/*.ts', 'packages/**/*.ts', 'etl/**/*.ts'],
    languageOptions: { globals: globals.node },
  },

  /*
   * Componentes Vue.
   *
   * Sin esto ESLint ignoraba en silencio todos los `.vue` —«File ignored because no matching
   * configuration was supplied»—, así que el lint no vigilaba ni una sola pantalla. No es un
   * detalle: buena parte de los fallos que se encontraron en la interfaz vivían dentro de
   * plantillas, leyendo campos que la API no devuelve, y nada los miraba.
   */
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      // El nombre del archivo ya dice el componente; exigir varias palabras en cada uno
      // obligaría a renombrar el catálogo entero sin ganar legibilidad.
      'vue/multi-word-component-names': 'off',
      // Prettier se encarga del formato de las plantillas; que ESLint también opine solo
      // produce conflictos entre las dos herramientas.
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/html-indent': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/attributes-order': 'off',
      // Un `v-if` dentro de un `v-for` sí es un error real de rendimiento y de lógica.
      'vue/no-use-v-if-with-v-for': 'error',
    },
  },
];
