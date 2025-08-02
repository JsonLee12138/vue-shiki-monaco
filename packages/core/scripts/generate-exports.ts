// oxlint-disable no-console
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcDir = path.join(__dirname, '../src');
const typesDir = path.join(__dirname, '../types');
const componentsDir = path.join(srcDir, 'components');
const hooksDir = path.join(srcDir, 'hooks');
const indexPath = path.join(srcDir, 'index.ts');
const typesIndexPath = path.join(typesDir, 'index.d.ts');

interface Component {
  name: string;
  path: string;
  type: 'component';
}

interface Hook {
  name: string;
  path: string;
  exports: {
    functions: string[];
    types: string[];
    interfaces: string[];
  };
  type: 'hook';
}

/**
 * 递归扫描目录，查找所有组件
 */
function scanComponents(dir: string, basePath = ''): Component[] {
  const components: Component[] = [];

  if (!fs.existsSync(dir))
    return components;

  const items = fs.readdirSync(dir);

  for (const item of items) {
    const itemPath = path.join(dir, item);
    const stat = fs.statSync(itemPath);

    if (stat.isDirectory()) {
      // 递归扫描子目录
      const subComponents = scanComponents(itemPath, path.join(basePath, item));
      components.push(...subComponents);
    }
    else if (item === 'index.vue') {
      // 找到组件文件
      const componentName = path.basename(basePath) || path.basename(path.dirname(itemPath));
      const relativePath = path.relative(srcDir, itemPath).replace(/\\/g, '/');

      components.push({
        name: componentName,
        path: `./${relativePath}`,
        type: 'component',
      });
    }
  }

  return components;
}

/**
 * 扫描 hooks 目录，查找所有 hook
 */
function scanHooks(dir: string): Hook[] {
  const hooks: Hook[] = [];

  if (!fs.existsSync(dir))
    return hooks;

  const items = fs.readdirSync(dir);

  for (const item of items) {
    const itemPath = path.join(dir, item);
    const stat = fs.statSync(itemPath);

    if (stat.isDirectory() && item !== 'index.ts') {
      // 检查是否有 index.ts 文件
      const indexPath = path.join(itemPath, 'index.ts');
      if (fs.existsSync(indexPath)) {
        const hookName = item;

        // 读取文件内容来提取导出
        const content = fs.readFileSync(indexPath, 'utf-8');
        const exports = extractExports(content);

        hooks.push({
          name: hookName,
          path: `./${hookName}`,
          exports,
          type: 'hook',
        });
      }
    }
  }

  return hooks;
}

/**
 * 从文件内容中提取导出的函数和类型
 */
function extractExports(content: string) {
  const exports = {
    functions: [] as string[],
    types: [] as string[],
    interfaces: [] as string[],
  };

  // 匹配 export function
  const functionMatches = content.match(/export\s+function\s+(\w+)/g);
  if (functionMatches) {
    exports.functions.push(...functionMatches
      .map(m => m.match(/export\s+function\s+(\w+)/)?.[1])
      .filter((name): name is string => name !== undefined));
  }

  // 匹配 export const/let/var (通常是 hooks)
  const constMatches = content.match(/export\s+(?:const|let|var)\s+(\w+)/g);
  if (constMatches) {
    exports.functions.push(...constMatches
      .map(m => m.match(/export\s+(?:const|let|var)\s+(\w+)/)?.[1])
      .filter((name): name is string => name !== undefined));
  }

  // 匹配 export type
  const typeMatches = content.match(/export\s+type\s+(\w+)/g);
  if (typeMatches) {
    exports.types.push(...typeMatches
      .map(m => m.match(/export\s+type\s+(\w+)/)?.[1])
      .filter((name): name is string => name !== undefined));
  }

  // 匹配 export interface
  const interfaceMatches = content.match(/export\s+interface\s+(\w+)/g);
  if (interfaceMatches) {
    exports.interfaces.push(...interfaceMatches
      .map(m => m.match(/export\s+interface\s+(\w+)/)?.[1])
      .filter((name): name is string => name !== undefined));
  }

  return exports;
}

/**
 * 确保目录存在
 */
function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 生成 src/components/index.ts 文件
 */
function generateComponentsIndex(components: Component[]): void {
  const componentsIndexPath = path.join(srcDir, 'components', 'index.ts');

  let content = '';
  for (const component of components) {
    content += `export { default as ${component.name} } from './${component.name}/index.vue';\n`;
    
    // 检查是否有 install.ts 文件
    const installPath = path.join(srcDir, 'components', component.name, 'install.ts');
    if (fs.existsSync(installPath)) {
      content += `export { default as ${component.name}WithInstall } from './${component.name}/install';\n`;
    }
  }

  fs.writeFileSync(componentsIndexPath, content);
  console.log('✅ 已生成 src/components/index.ts');
}

/**
 * 生成 src/hooks/index.ts 文件
 */
function generateHooksIndex(hooks: Hook[]): void {
  const hooksIndexPath = path.join(srcDir, 'hooks', 'index.ts');
  ensureDir(path.dirname(hooksIndexPath));

  let content = '';
  for (const hook of hooks) {
    // 导出函数
    if (hook.exports.functions.length > 0) {
      const functions = hook.exports.functions.sort().join(', ');
      content += `export { ${functions} } from './${hook.name}';\n`;
    }

    // 导出类型和接口
    const types = [...hook.exports.types, ...hook.exports.interfaces];
    if (types.length > 0) {
      const typeList = types.sort().join(', ');
      content += `export type { ${typeList} } from './${hook.name}';\n`;
    }
  }

  fs.writeFileSync(hooksIndexPath, content);
  console.log('✅ 已生成 src/hooks/index.ts');
}

/**
 * 生成主 index.ts 文件 - 新的现代化导出风格
 */
function generateMainIndex(components: Component[]): void {
  const content = `import type { App, Plugin } from 'vue';
${components.map(c => `import ${c.name} from './components/${c.name}/index.vue';`).join('\n')}

// 组件导出
${components.map(c => `export { default as ${c.name} } from './components/${c.name}/index.vue';`).join('\n')}
${components.map(c => {
    const installPath = path.join(srcDir, 'components', c.name, 'install.ts');
    return fs.existsSync(installPath) ? `export { default as ${c.name}WithInstall } from './components/${c.name}/install';` : '';
  }).filter(Boolean).join('\n')}

// Hooks 导出
export * from './hooks';

// 类型导出
export type * from './types';

// 全量导出（保持向后兼容）
export * from './components';

// 全局插件
const VueElementPlusXShikiMonaco: Plugin = {
  install(app: App) {
${components.map(c => `    app.component('${c.name}', ${c.name});`).join('\n')}
  }
};

export { VueElementPlusXShikiMonaco };
export default VueElementPlusXShikiMonaco;`;

  fs.writeFileSync(indexPath, content);
  console.log('✅ 已生成 src/index.ts');
}

/**
 * 生成 components-only.ts 文件
 */
function generateComponentsOnly(components: Component[]): void {
  const content = `// 仅组件导出，不包含插件
${components.map(c => `export { default as ${c.name} } from './components/${c.name}/index.vue';`).join('\n')}
${components.map(c => {
    const installPath = path.join(srcDir, 'components', c.name, 'install.ts');
    return fs.existsSync(installPath) ? `export { default as ${c.name}WithInstall } from './components/${c.name}/install';` : '';
  }).filter(Boolean).join('\n')}`;

  const componentsOnlyPath = path.join(srcDir, 'components-only.ts');
  fs.writeFileSync(componentsOnlyPath, content);
  console.log('✅ 已生成 src/components-only.ts');
}

/**
 * 生成 hooks-only.ts 文件
 */
function generateHooksOnly(hooks: Hook[]): void {
  let content = '// 仅 hooks 导出\n';
  
  for (const hook of hooks) {
    // 导出函数
    if (hook.exports.functions.length > 0) {
      const functions = hook.exports.functions.sort().join(', ');
      content += `export { ${functions} } from './hooks/${hook.name}';\n`;
    }

    // 导出类型和接口
    const types = [...hook.exports.types, ...hook.exports.interfaces];
    if (types.length > 0) {
      const typeList = types.sort().join(', ');
      content += `export type { ${typeList} } from './hooks/${hook.name}';\n`;
    }
  }

  const hooksOnlyPath = path.join(srcDir, 'hooks-only.ts');
  fs.writeFileSync(hooksOnlyPath, content);
  console.log('✅ 已生成 src/hooks-only.ts');
}

/**
 * 生成 types.ts 文件
 */
function generateTypes(components: Component[], hooks: Hook[]): void {
  const content = `// 全局类型定义文件
import type { Plugin } from 'vue';

// Vue 应用扩展类型声明（必须在顶层）
declare module '@vue/runtime-core' {
  interface GlobalComponents {
${components.map(c => `    ${c.name}: typeof import('./components/${c.name}/index.vue')['default'];`).join('\n')}
  }
}

// 导出组件实例类型
${components.map(c => `export type ${c.name}Instance = InstanceType<typeof import('./components/${c.name}/index.vue')['default']>;`).join('\n')}

// 导出 hooks 相关类型
${hooks.map(hook => {
    const types = [...hook.exports.types, ...hook.exports.interfaces];
    if (types.length > 0) {
      const typeList = types.sort().join(', ');
      return `export type { ${typeList} } from './hooks/${hook.name}';`;
    }
    return '';
  }).filter(Boolean).join('\n')}

// 导出插件类型
export interface VueElementPlusXShikiMonacoOptions {
  // 未来可能的配置选项
}

export type VueElementPlusXShikiMonacoPlugin = Plugin & {
  // 可能的额外方法
};

// 导出常用类型工具
export type ComponentProps<T> = T extends (...args: any) => any
  ? never
  : T extends new (...args: any) => any
    ? InstanceType<T>['$props']
    : never;

${components.map(c => `export type ${c.name}Props = ComponentProps<typeof import('./components/${c.name}/index.vue')['default']>;`).join('\n')}`;

  const typesPath = path.join(srcDir, 'types.ts');
  fs.writeFileSync(typesPath, content);
  console.log('✅ 已生成 src/types.ts');
}

/**
 * 生成 resolver.ts 文件
 */
function generateResolver(components: Component[]): void {
  const content = `// 组件名与路径映射，支持 unplugin-vue-components 自动导入
export const resolverHelper = {
  // 组件解析器
  components: {
${components.map(c => `    ${c.name}: () => import('@vue-element-plus-x-shiki-monaco/core/${c.name}'),`).join('\n')}
  },
  
  // 样式解析器
  styles: {
${components.map(c => `    ${c.name}: '@vue-element-plus-x-shiki-monaco/core/${c.name}/style.css',`).join('\n')}
  },
  
  // 自定义解析器函数
  resolver: (componentName: string) => {
    const componentMap = {
${components.map(c => `      '${c.name}': {
        name: '${c.name}',
        from: '@vue-element-plus-x-shiki-monaco/core/${c.name}',
        sideEffects: '@vue-element-plus-x-shiki-monaco/core/${c.name}/style.css'
      }`).join(',\n')}
    };
    
    return componentMap[componentName as keyof typeof componentMap];
  }
};

export default resolverHelper;`;

  const resolverPath = path.join(srcDir, 'resolver.ts');
  fs.writeFileSync(resolverPath, content);
  console.log('✅ 已生成 src/resolver.ts');
}
function generateTypesComponentsIndex(components: Component[]): void {
  const typesComponentsDir = path.join(typesDir, 'components');
  ensureDir(typesComponentsDir);

  let content = '';
  for (const component of components) {
    content += `export { default as ${component.name} } from './${component.name}';\n`;
    content += `export type { ${component.name}Props, ${component.name}Emits, ${component.name}Expose } from './${component.name}';\n`;
  }

  const typesComponentsIndexPath = path.join(typesComponentsDir, 'index.d.ts');
  fs.writeFileSync(typesComponentsIndexPath, content);
  console.log('✅ 已生成 types/components/index.d.ts');
}

/**
 * 生成 types/hooks/index.d.ts 文件
 */
function generateTypesHooksIndex(hooks: Hook[]): void {
  const typesHooksDir = path.join(typesDir, 'hooks');
  ensureDir(typesHooksDir);

  let content = '';
  for (const hook of hooks) {
    // 导出函数
    if (hook.exports.functions.length > 0) {
      const functions = hook.exports.functions.sort().join(', ');
      content += `export { ${functions} } from './${hook.name}';\n`;
    }

    // 导出类型和接口
    const types = [...hook.exports.types, ...hook.exports.interfaces];
    if (types.length > 0) {
      const typeList = types.sort().join(', ');
      content += `export type { ${typeList} } from './${hook.name}';\n`;
    }
  }

  const typesHooksIndexPath = path.join(typesHooksDir, 'index.d.ts');
  fs.writeFileSync(typesHooksIndexPath, content);
  console.log('✅ 已生成 types/hooks/index.d.ts');
}

/**
 * 为每个组件生成独立的类型文件
 */
function generateComponentTypeFiles(components: Component[]): void {
  for (const component of components) {
    const componentTypesDir = path.join(typesDir, 'components', component.name);
    ensureDir(componentTypesDir);

    // 手动创建组件类型定义
    const typeContent = `import type { DefineComponent } from 'vue';
import type { BundledLanguage, BundledTheme } from 'shiki';
import type { EditInstance } from '../../hooks/useMonacoEdit';

export interface ${component.name}Props {
  language?: BundledLanguage;
  theme?: BundledTheme;
  value?: string;
  height?: string;
  showToolbar?: boolean;
}

export interface ${component.name}Emits {
  change: (value: string) => void;
  ready: (editor: EditInstance) => void;
}

export interface ${component.name}Expose {
  getEditor: () => EditInstance | null;
  setValue: (value: string) => void;
  getValue: () => string;
  focus: () => void;
  copyCode: () => Promise<void>;
  formatCode: () => void;
}

declare const ${component.name}: DefineComponent<${component.name}Props, {}, {}, {}, {}, {}, {}, ${component.name}Emits, string, {}, string, ${component.name}Expose>;

export default ${component.name};`;

    const typeFilePath = path.join(componentTypesDir, 'index.d.ts');
    fs.writeFileSync(typeFilePath, typeContent);
    console.log(`✅ 已生成 types/components/${component.name}/index.d.ts`);
  }
}

/**
 * 为每个 hook 生成独立的类型文件
 */
function generateHookTypeFiles(hooks: Hook[]): void {
  for (const hook of hooks) {
    const hookTypesDir = path.join(typesDir, 'hooks', hook.name);
    ensureDir(hookTypesDir);

    // 读取源 hook 文件内容
    const srcHookPath = path.join(hooksDir, hook.name, 'index.ts');
    if (fs.existsSync(srcHookPath)) {
      const srcContent = fs.readFileSync(srcHookPath, 'utf-8');

      // 生成类型声明，仅提取接口和类型定义
      let typeContent = '';

      // 添加必要的导入
      if (srcContent.includes('monaco-editor-core')) {
        typeContent += "import type * as monaco from 'monaco-editor-core';\n";
      }
      if (srcContent.includes('shiki')) {
        typeContent += "import type { BundledLanguage, BundledTheme } from 'shiki';\n";
      }
      if (typeContent) {
        typeContent += '\n';
      }

      // 提取接口定义
      const interfaceMatches = srcContent.match(/export\s+interface\s+\w+\s*\{[^}]*\}/gs);
      if (interfaceMatches) {
        typeContent += `${interfaceMatches.join('\n\n')}\n\n`;
      }

      // 提取类型定义
      const typeMatches = srcContent.match(/export\s+type\s+\w+\s*=[^;]+;/g);
      if (typeMatches) {
        typeContent += `${typeMatches.join('\n')}\n\n`;
      }

      // 提取函数声明
      if (hook.exports.functions.length > 0) {
        for (const funcName of hook.exports.functions) {
          // 查找函数定义并生成声明
          const funcRegex = new RegExp(`export\\s+function\\s+${funcName}\\s*\\([^)]*\\)\\s*:\\s*[^{]+`, 'g');
          const funcMatch = srcContent.match(funcRegex);
          if (funcMatch) {
            typeContent += `export declare function ${funcMatch[0].replace('export function', '').trim()};\n`;
          }
        }
      }

      const typeFilePath = path.join(hookTypesDir, 'index.d.ts');
      fs.writeFileSync(typeFilePath, typeContent);
      console.log(`✅ 已生成 types/hooks/${hook.name}/index.d.ts`);
    }
  }
}

/**
 * 生成主类型文件
 */
function generateMainTypesIndex(): void {
  const content = `import type { Plugin } from 'vue';

export * from './components';
export * from './hooks';

declare const VueElementPlusXShikiMonaco: Plugin;
export default VueElementPlusXShikiMonaco;`;

  fs.writeFileSync(typesIndexPath, content);
  console.log('✅ 已生成 types/index.d.ts');
}

/**
 * 主函数
 */
function main(): void {
  console.log('🔍 扫描组件和 hooks...');

  // 扫描组件
  const components = scanComponents(componentsDir);
  console.log(`✅ 找到 ${components.length} 个组件:`, components.map(c => c.name));

  // 扫描 hooks
  const hooks = scanHooks(hooksDir);
  console.log(`✅ 找到 ${hooks.length} 个 hook 文件:`, hooks.map(h => h.name));

  // 确保 types 目录存在
  ensureDir(typesDir);

  // 生成所有文件
  generateComponentsIndex(components);
  generateHooksIndex(hooks);
  generateMainIndex(components);
  generateComponentsOnly(components);
  generateHooksOnly(hooks);
  generateTypes(components, hooks);
  generateResolver(components);
  generateTypesComponentsIndex(components);
  generateTypesHooksIndex(hooks);
  generateComponentTypeFiles(components);
  generateHookTypeFiles(hooks);
  generateMainTypesIndex();

  console.log('🎉 所有文件生成完成!');
}

// 直接执行 main 函数
main();

export { main };