/* Rebuild the admin's bundled questionnaire catalog from the shipped client forms.
 * Usage: node scripts/extract-questionnaire-built-ins.cjs <client-portal-directory>
 * This reads source files only; it never connects to a database.
 */
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const parser = require('next/dist/compiled/babel/bundle').parser();
const clientRoot = path.resolve(process.argv[2] || '../plylegal-client-portal');
const outputPath = path.resolve(__dirname, '../src/lib/.tmp-questionnaireBuiltInPages.js');
const parsed = new Map();
function walk(node, visit, ancestors = []) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'string') visit(node, ancestors);
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'start', 'end', 'comments', 'tokens'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(child => walk(child, visit, [...ancestors, node]));
    else if (value && typeof value === 'object') walk(value, visit, [...ancestors, node]);
  }
}
const nodes = (node, predicate) => {
  const found = [];
  walk(node, (child, ancestors) => { if (predicate(child)) found.push({ node: child, ancestors }); });
  return found;
};
function literal(node) {
  return ['StringLiteral', 'NumericLiteral', 'BooleanLiteral'].includes(node?.type) ? node.value : undefined;
}
function propertyName(node) { return node?.name || literal(node); }
function jsxName(node) { return node?.openingElement?.name?.name; }
function textOf(node) {
  if (node?.type === 'JSXText') return node.value;
  if (node?.type === 'StringLiteral') return node.value;
  if (node?.type === 'JSXExpressionContainer') return textOf(node.expression);
  return (node?.children || []).map(textOf).join(' ');
}
function cleanLabel(value) {
  return String(value || '').replace(/\s+/g, ' ').replace(/\s*\*$/, '').trim()
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}
function formatLabel(key) {
  return key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ')
    .replace(/\b\w/g, match => match.toUpperCase());
}
function attribute(node, name) {
  const found = node.openingElement.attributes.find(item => item.type === 'JSXAttribute' && item.name.name === name);
  return found?.value?.type === 'JSXExpressionContainer' ? found.value.expression : found?.value;
}
function readFile(file) {
  if (parsed.has(file)) return parsed.get(file);
  const source = fs.readFileSync(file, 'utf8');
  const ast = parser.parse(source, { sourceType: 'module', plugins: ['jsx'] });
  const reexport = ast.program.body.find(node => node.type === 'ExportNamedDeclaration' && node.source && node.specifiers.some(specifier => specifier.exported?.name === 'default'));
  if (reexport) {
    const target = reexport.source.value.startsWith('@/')
      ? path.join(clientRoot, 'src', reexport.source.value.slice(2))
      : path.resolve(path.dirname(file), reexport.source.value);
    const resolved = ['', '.js', '.jsx'].map(extension => target + extension).find(candidate => fs.existsSync(candidate));
    return readFile(resolved || `${target}.js`);
  }
  const context = { file, source, ast, variables: new Map(), imports: new Map() };
  parsed.set(file, context);
  walk(ast, node => {
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') context.variables.set(node.id.name, node.init);
    if (node.type === 'FunctionDeclaration' && node.id) context.variables.set(node.id.name, node);
    if (node.type === 'ImportDeclaration') {
      for (const specifier of node.specifiers) context.imports.set(specifier.local.name, { source: node.source.value, imported: specifier.imported?.name });
    }
  });
  return context;
}
function resolveIdentifier(node, context, seen = new Set()) {
  if (node?.type !== 'Identifier' || seen.has(node.name)) return { node, context };
  seen.add(node.name);
  if (context.variables.has(node.name)) return resolveIdentifier(context.variables.get(node.name), context, seen);
  const imported = context.imports.get(node.name);
  if (imported?.source.startsWith('@/')) {
    const base = path.join(clientRoot, 'src', imported.source.slice(2));
    const file = ['', '.js', '.jsx'].map(ext => base + ext).find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
    if (file) {
      const next = readFile(file);
      return resolveIdentifier(next.variables.get(imported.imported), next, seen);
    }
  }
  return { node, context };
}
function schemaCall(node, method) {
  if (!node) return null;
  if (node.type === 'CallExpression' && node.callee?.type === 'MemberExpression') {
    if (node.callee.object?.name === 'z' && node.callee.property?.name === method) return node;
    return schemaCall(node.callee.object, method);
  }
  return null;
}
function schemaAcceptsUndefined(rawSchema, context, seen = new Set(), depth = 0) {
  if (!rawSchema || depth > 20) return false;

  if (rawSchema.type === 'Identifier') {
    if (rawSchema.name === 'undefined') return true;
    const token = `${context.file || ''}:${rawSchema.name}`;
    if (seen.has(token)) return false;
    const nextSeen = new Set(seen).add(token);
    const resolved = resolveIdentifier(rawSchema, context);
    if (resolved.node === rawSchema) return false;
    return schemaAcceptsUndefined(resolved.node, resolved.context, nextSeen, depth + 1);
  }

  if (['TSAsExpression', 'TSSatisfiesExpression', 'TypeCastExpression'].includes(rawSchema.type)) {
    return schemaAcceptsUndefined(rawSchema.expression, context, seen, depth + 1);
  }
  if (rawSchema.type === 'ParenthesizedExpression') {
    return schemaAcceptsUndefined(rawSchema.expression, context, seen, depth + 1);
  }
  if (rawSchema.type === 'ConditionalExpression') {
    return schemaAcceptsUndefined(rawSchema.consequent, context, seen, depth + 1)
      || schemaAcceptsUndefined(rawSchema.alternate, context, seen, depth + 1);
  }
  if (rawSchema.type === 'LogicalExpression') {
    return schemaAcceptsUndefined(rawSchema.left, context, seen, depth + 1)
      || schemaAcceptsUndefined(rawSchema.right, context, seen, depth + 1);
  }
  if (rawSchema.type === 'ArrowFunctionExpression') {
    return schemaAcceptsUndefined(rawSchema.body, context, seen, depth + 1);
  }
  if (rawSchema.type !== 'CallExpression') return false;

  const callee = rawSchema.callee;
  if (callee?.type === 'MemberExpression') {
    const method = propertyName(callee.property);
    const owner = callee.object;

    // These wrappers explicitly accept a missing object property.
    if (['optional', 'nullish', 'default', 'catch'].includes(method)) return true;
    if (method === 'nonoptional') return false;

    if (owner?.name === 'z') {
      if (['undefined', 'void', 'any', 'unknown'].includes(method)) return true;
      if (['optional', 'nullish'].includes(method)) return true;
      if (method === 'union') {
        const members = rawSchema.arguments[0]?.elements || [];
        return members.some(member => schemaAcceptsUndefined(member, context, seen, depth + 1));
      }
      if (method === 'intersection') {
        return rawSchema.arguments.slice(0, 2)
          .every(member => schemaAcceptsUndefined(member, context, seen, depth + 1));
      }
      if (method === 'lazy') {
        return schemaAcceptsUndefined(rawSchema.arguments[0], context, seen, depth + 1);
      }
      return false;
    }

    if (method === 'or') {
      return schemaAcceptsUndefined(owner, context, seen, depth + 1)
        || schemaAcceptsUndefined(rawSchema.arguments[0], context, seen, depth + 1);
    }
    if (method === 'and' || method === 'pipe') {
      return schemaAcceptsUndefined(owner, context, seen, depth + 1)
        && schemaAcceptsUndefined(rawSchema.arguments[0], context, seen, depth + 1);
    }

    // Refinements, transforms, descriptions, nullability, and other fluent Zod
    // methods preserve whether the input schema accepts undefined.
    return schemaAcceptsUndefined(owner, context, seen, depth + 1);
  }

  return false;
}
function schemaRequiresNonEmptyCollection(rawSchema, context, seen = new Set(), depth = 0) {
  if (!rawSchema || depth > 20) return false;
  if (rawSchema.type === 'Identifier') {
    const token = `${context.file || ''}:${rawSchema.name}`;
    if (seen.has(token)) return false;
    const resolved = resolveIdentifier(rawSchema, context);
    if (resolved.node === rawSchema) return false;
    return schemaRequiresNonEmptyCollection(resolved.node, resolved.context, new Set(seen).add(token), depth + 1);
  }
  if (['TSAsExpression', 'TSSatisfiesExpression', 'TypeCastExpression', 'ParenthesizedExpression'].includes(rawSchema.type)) {
    return schemaRequiresNonEmptyCollection(rawSchema.expression, context, seen, depth + 1);
  }
  if (rawSchema.type !== 'CallExpression' || rawSchema.callee?.type !== 'MemberExpression') return false;

  const method = propertyName(rawSchema.callee.property);
  const owner = rawSchema.callee.object;
  if (['optional', 'nullable', 'nullish', 'default', 'catch'].includes(method)) return false;
  if (method === 'nonempty') return true;
  if (['min', 'length'].includes(method)) return Number(literal(rawSchema.arguments[0])) > 0;

  if (owner?.name === 'z' && method === 'union') {
    const members = rawSchema.arguments[0]?.elements || [];
    return members.length > 0 && members.every(member => schemaRequiresNonEmptyCollection(member, context, seen, depth + 1));
  }
  if (method === 'or') {
    return schemaRequiresNonEmptyCollection(owner, context, seen, depth + 1)
      && schemaRequiresNonEmptyCollection(rawSchema.arguments[0], context, seen, depth + 1);
  }
  if (method === 'and') {
    return schemaRequiresNonEmptyCollection(owner, context, seen, depth + 1)
      || schemaRequiresNonEmptyCollection(rawSchema.arguments[0], context, seen, depth + 1);
  }
  return schemaRequiresNonEmptyCollection(owner, context, seen, depth + 1);
}
function schemaProperties(object, context) {
  const properties = [];
  for (const property of object?.arguments[0]?.properties || []) {
    if (property.type === 'ObjectProperty') { properties.push(property); continue; }
    if (property.type !== 'SpreadElement') continue;
    const map = nodes(property.argument, node => node.type === 'CallExpression' && node.callee?.property?.name === 'map')[0]?.node;
    const keys = resolveIdentifier(map?.callee?.object, context).node;
    if (keys?.type !== 'ArrayExpression') continue;
    for (const key of keys.elements.map(literal).filter(value => typeof value === 'string')) {
      properties.push({ type: 'ObjectProperty', key: { type: 'Identifier', name: key }, value: { type: 'CallExpression', callee: { type: 'MemberExpression', object: { type: 'Identifier', name: 'z' }, property: { type: 'Identifier', name: 'string' } }, arguments: [] } });
    }
  }
  return [...new Map(properties.map(property => [propertyName(property.key), property])).values()];
}
function expandSchema(node, context, depth = 0) {
  if (depth > 10) return node;
  if (node?.type === 'Identifier') return expandSchema(resolveIdentifier(node, context).node, context, depth + 1);
  if (node?.type === 'CallExpression' && node.callee?.type === 'MemberExpression' && node.callee.object?.type === 'Identifier' && node.callee.object.name !== 'z') {
    return { ...node, callee: { ...node.callee, object: expandSchema(node.callee.object, context, depth + 1) } };
  }
  if (node?.type === 'CallExpression' && node.callee?.type === 'MemberExpression') return { ...node, callee: { ...node.callee, object: expandSchema(node.callee.object, context, depth + 1) } };
  return node;
}
function componentSchema(name, context, depth = 0) {
  if (!name || depth > 5) return null;
  const resolved = resolveIdentifier({ type: 'Identifier', name }, context);
  const declaration = nodes(resolved.node, node => node.type === 'VariableDeclarator' && /schema/i.test(node.id?.name || '') && Boolean(schemaCall(node.init, 'object')))[0]?.node;
  if (declaration) return { node: declaration.init, context: { ...resolved.context, ast: resolved.node } };
  const resolver = nodes(resolved.node, node => node.type === 'CallExpression' && node.callee?.name === 'zodResolver')[0]?.node;
  if (resolver) {
    const schema = resolveIdentifier(resolver.arguments[0], resolved.context);
    if (schemaCall(schema.node, 'object')) return { ...schema, context: { ...schema.context, ast: resolved.node } };
  }
  for (const { node } of nodes(resolved.node, node => node.type === 'JSXElement')) {
    const nested = componentSchema(jsxName(node), resolved.context, depth + 1);
    if (nested) return nested;
  }
  return null;
}
function fieldCalls(node, field) {
  return nodes(node, child => child.type === 'CallExpression' && ['register', 'watch', 'setValue'].includes(child.callee?.property?.name || child.callee?.name) && literal(child.arguments[0]) === field);
}
function fieldUi(field, context) {
  const named = nodes(context.ast, node => node.type === 'JSXElement' && literal(attribute(node, 'name')) === field && literal(attribute(node, 'label')))[0];
  if (named) return { label: cleanLabel(literal(attribute(named.node, 'label'))), element: named.node, ancestors: named.ancestors };
  const candidates = fieldCalls(context.ast, field);
  for (const candidate of candidates) {
    for (const ancestor of [...candidate.ancestors].reverse()) {
      if (ancestor.type !== 'JSXElement') continue;
      const labels = nodes(ancestor, child => child.type === 'JSXElement' && ['Label', 'label'].includes(jsxName(child)))
        .map(({ node }) => cleanLabel(textOf(node))).filter(label => label && !['Yes', 'No'].includes(label));
      if (labels.length) return { label: labels[0], element: ancestor, ancestors: candidate.ancestors };
    }
  }
  const explicit = nodes(context.ast, child => child.type === 'JSXElement' && ['Label', 'label'].includes(jsxName(child)) && literal(attribute(child, 'htmlFor')) === field)[0];
  return { label: explicit ? cleanLabel(textOf(explicit.node)) : formatLabel(field), element: null, ancestors: [] };
}
function staticOptions(node, context) {
  const resolved = resolveIdentifier(node, context);
  if (resolved.node?.type === 'CallExpression' &&
      resolved.node.callee?.type === 'MemberExpression' &&
      propertyName(resolved.node.callee.property) === 'filter') {
    return staticOptions(resolved.node.callee.object, resolved.context);
  }
  if (resolved.node?.type === 'CallExpression' &&
      resolved.node.callee?.type === 'MemberExpression' &&
      propertyName(resolved.node.callee.property) === 'map') {
    const source = staticOptions(resolved.node.callee.object, resolved.context);
    const mapper = resolved.node.arguments[0];
    const parameter = mapper?.params?.[0]?.name;
    let body = mapper?.body;
    if (body?.type === 'ParenthesizedExpression') body = body.expression;
    if (!source?.length || !parameter || body?.type !== 'ObjectExpression') return null;
    const properties = Object.fromEntries(body.properties
      .filter(property => property.type === 'ObjectProperty')
      .map(property => [propertyName(property.key), property.value]));
    const mappedValue = (expression, option) => {
      if (expression?.type === 'Identifier' && expression.name === parameter) return option.value;
      if (expression?.type === 'MemberExpression' && expression.object?.name === parameter) {
        const key = propertyName(expression.property);
        if (key === 'value' || key === 'label') return option[key];
      }
      return literal(expression);
    };
    const mapped = source.map(option => ({
      value: mappedValue(properties.value, option),
      label: mappedValue(properties.label, option),
    }));
    if (mapped.some(option => option.value === undefined)) return null;
    return mapped.map(option => ({
      value: String(option.value),
      label: String(option.label ?? option.value),
    }));
  }
  if (resolved.node?.type === 'CallExpression' &&
      ['optionsWithSavedValue', 'withCurrentOption'].includes(
        resolved.node.callee?.property?.name || resolved.node.callee?.name
      )) {
    return staticOptions(resolved.node.arguments[0], resolved.context);
  }
  if (resolved.node?.type !== 'ArrayExpression') return null;
  const options = resolved.node.elements.map(item => {
    const value = literal(item);
    if (value !== undefined) return { value: String(value), label: String(value) };
    if (item?.type !== 'ObjectExpression') return null;
    const props = Object.fromEntries(item.properties.filter(prop => prop.type === 'ObjectProperty').map(prop => [propertyName(prop.key), literal(prop.value)]));
    return props.value !== undefined ? { value: String(props.value), label: String(props.label ?? props.value) } : null;
  });
  return options.every(Boolean) && options.length <= 100 ? options : null;
}
function uniqueOptions(options = []) {
  return [...new Map(options
    .filter(option => option && typeof option.value === 'string' && option.value.length > 0)
    .map(option => [option.value, option])).values()];
}
function choiceControlFields(element) {
  const fields = new Set();
  const named = literal(attribute(element, 'name'));
  if (typeof named === 'string') fields.add(named);

  for (const attributeName of ['value', 'checked', 'defaultValue']) {
    const value = attribute(element, attributeName);
    for (const { node } of nodes(value, candidate =>
      candidate.type === 'CallExpression' &&
      ['register', 'watch', 'getValues'].includes(candidate.callee?.property?.name || candidate.callee?.name)
    )) {
      const field = literal(node.arguments[0]);
      if (typeof field === 'string') fields.add(field);
    }
  }

  for (const attributeName of ['onValueChange', 'onCheckedChange', 'onChange']) {
    const handler = attribute(element, attributeName);
    const setter = nodes(handler, candidate =>
      candidate.type === 'CallExpression' &&
      (candidate.callee?.property?.name || candidate.callee?.name) === 'setValue'
    )[0]?.node;
    const field = literal(setter?.arguments[0]);
    if (typeof field === 'string') fields.add(field);
  }

  return fields;
}
function choiceContainers(element, containerNames, field) {
  if (!element) return [];
  let containers = nodes(element, node =>
    node.type === 'JSXElement' && containerNames.includes(jsxName(node))
  ).map(({ node }) => node);
  if (!containers.length) return [];
  const associated = containers.filter(container => choiceControlFields(container).has(field));
  if (associated.length) containers = associated;
  else if (literal(attribute(element, 'name')) === field && containers.length === 1) containers = [containers[0]];
  else if (containerNames.includes(jsxName(element))) containers = [element];
  else return [];
  return containers;
}
function choiceOptions(element, context, itemNames, field) {
  const roots = choiceContainers(element, itemNames.containers, field);
  if (!roots.length) return [];
  const options = [];

  for (const root of roots) {
    const mapped = nodes(root, node => node.type === 'CallExpression' && node.callee?.property?.name === 'map')
      .map(({ node }) => staticOptions(node.callee.object, context))
      .find(values => values?.length);
    if (mapped) options.push(...mapped);

    const labels = new Map(nodes(root, node =>
      node.type === 'JSXElement' && ['Label', 'label'].includes(jsxName(node))
    ).map(({ node }) => [literal(attribute(node, 'htmlFor')), cleanLabel(textOf(node))])
      .filter(([id, label]) => typeof id === 'string' && label));

    for (const { node } of nodes(root, node =>
      node.type === 'JSXElement' && itemNames.items.includes(jsxName(node))
    )) {
      const value = literal(attribute(node, 'value'));
      if (value === undefined) continue;
      const id = literal(attribute(node, 'id'));
      const ownLabel = cleanLabel(textOf(node));
      options.push({
        value: String(value),
        label: labels.get(id) || ownLabel || String(value),
      });
    }
  }

  return uniqueOptions(options);
}
function isYesNoOptions(options) {
  const values = new Set((options || []).map(option => option.value));
  return values.size === 2 && values.has('yes') && values.has('no');
}
const LOWER_YES_NO_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];
function applyUiChoiceControl(descriptor, ui, context) {
  if (!ui.element || descriptor.type !== 'text') return;
  // Day/month/year controls are generated from large or time-dependent lists
  // and differ in padding, month values, and year ranges between forms. Keep
  // them as storage-compatible text unless a reviewed dateParts enricher maps
  // the exact three keys and option semantics.
  if (/(?:^|_)(?:day|month|year)$/.test(descriptor.answerKey)) return;

  const fieldType = jsxName(ui.element) === 'Field' ? literal(attribute(ui.element, 'type')) : null;
  if (fieldType === 'checkbox') {
    // Reaching this branch means the backing schema is string-like. Preserve
    // its persisted yes/no values instead of emitting a boolean checkbox.
    descriptor.type = 'yesNo';
    descriptor.options = LOWER_YES_NO_OPTIONS.map(option => ({ ...option }));
    return;
  }
  if (fieldType === 'radio' || fieldType === 'select') {
    const options = staticOptions(attribute(ui.element, 'options'), context) || [];
    if (options.length) {
      descriptor.type = fieldType === 'radio' && isYesNoOptions(options) ? 'yesNo' : fieldType;
      descriptor.options = options;
      return;
    }
  }

  const radioOptions = choiceOptions(ui.element, context, {
    containers: ['RadioGroup'],
    items: ['RadioGroupItem'],
  }, descriptor.answerKey);
  if (radioOptions.length) {
    descriptor.type = isYesNoOptions(radioOptions) ? 'yesNo' : 'radio';
    descriptor.options = radioOptions;
    return;
  }

  const selectOptions = choiceOptions(ui.element, context, {
    containers: ['Select', 'select'],
    items: ['SelectItem', 'option'],
  }, descriptor.answerKey);
  if (selectOptions.length) {
    descriptor.type = 'select';
    descriptor.options = selectOptions;
    return;
  }

  const checkboxes = nodes(ui.element, node => node.type === 'JSXElement' &&
    (jsxName(node) === 'Checkbox' ||
      (['Input', 'input'].includes(jsxName(node)) && literal(attribute(node, 'type')) === 'checkbox'))
  ).map(({ node }) => node);
  const checkbox = checkboxes.find(node => choiceControlFields(node).has(descriptor.answerKey))
    || (literal(attribute(ui.element, 'name')) === descriptor.answerKey && checkboxes.length === 1
      ? checkboxes[0]
      : null);
  if (checkbox) {
    descriptor.type = 'yesNo';
    descriptor.options = LOWER_YES_NO_OPTIONS.map(option => ({ ...option }));
  }
}
function describeField(key, rawSchema, context, prefix, depth = 0, schemaBacked = true, sourceSchemaContext = context) {
  const resolved = resolveIdentifier(rawSchema, context);
  const sourceResolved = resolveIdentifier(rawSchema, sourceSchemaContext);
  const schema = expandSchema(resolved.node, resolved.context);
  const sourceSchema = expandSchema(sourceResolved.node, sourceResolved.context);
  const schemaContext = resolved.context;
  const ui = fieldUi(key, context);
  const descriptor = {
    id: `${prefix}-${key}`.replace(/[^A-Za-z0-9_.:-]/g, '-').slice(0, 128),
    answerKey: key,
    label: ui.label,
    type: 'text',
    required: schemaBacked && !schemaAcceptsUndefined(rawSchema, sourceSchemaContext),
  };
  const enumCall = schemaCall(schema, 'enum');
  const unionCall = schemaCall(schema, 'union');
  const enumValues = enumCall ? staticOptions(enumCall.arguments[0], schemaContext) : unionCall ? nodes(unionCall, node => Boolean(schemaCall(node, 'enum'))).map(({ node }) => staticOptions(schemaCall(node, 'enum').arguments[0], schemaContext)).find(Boolean) : null;
  if (enumValues) {
    descriptor.type = enumValues.length === 2 && enumValues.some(option => option.value === 'yes') && enumValues.some(option => option.value === 'no') ? 'yesNo' : 'select';
    descriptor.options = enumValues;
  }
  if (schemaCall(schema, 'boolean')) {
    descriptor.type = 'checkbox';
    // A required dynamic checkbox means "must be checked", while z.boolean()
    // only requires a boolean value and accepts false.
    descriptor.required = false;
  }
  const array = schemaCall(schema, 'array');
  const object = schemaCall(schema, 'object');
  const sourceArray = schemaCall(sourceSchema, 'array');
  if ((array || object) && depth < 4) {
    descriptor.type = 'repeater';
    // The dynamic renderer interprets required repeaters as non-empty. A bare
    // Zod array/object only requires the property to exist and can still be
    // empty, so only explicit positive collection constraints map safely.
    descriptor.required = schemaBacked && Boolean(array)
      && schemaRequiresNonEmptyCollection(rawSchema, sourceSchemaContext);
    let rowSchema = array ? array.arguments[0] : schema;
    let rowContext = schemaContext;
    let rowSourceSchema = sourceArray ? sourceArray.arguments[0] : sourceSchema;
    let rowSourceContext = sourceResolved.context;
    let rowSchemaBacked = schemaBacked;
    let rowObject = schemaCall(resolveIdentifier(rowSchema, rowContext).node, 'object');
    if (array && (!rowObject || !rowObject.arguments[0]?.properties?.length)) {
      const tables = nodes(context.ast, node => node.type === 'JSXElement' && jsxName(node) === 'RepeaterTable');
      for (const { node: table } of tables) {
        const data = attribute(table, 'data');
        const dataResolved = resolveIdentifier(data, context).node;
        const hasProperty = nodes(dataResolved, node => node.type === 'MemberExpression' && propertyName(node.property) === key).length;
        if (!fieldCalls(dataResolved, key).length && !hasProperty && literal(data) !== key) continue;
        const component = attribute(table, 'DialogComponent');
        const names = component?.type === 'Identifier' ? [component.name] : nodes(component, node => node.type === 'JSXElement').map(({ node }) => jsxName(node));
        for (const name of names) {
          const componentResolved = componentSchema(name, context);
          if (componentResolved) {
            rowSchema = componentResolved.node;
            rowContext = componentResolved.context;
            rowSourceSchema = componentResolved.node;
            rowSourceContext = componentResolved.context;
            rowSchemaBacked = true;
            rowObject = schemaCall(rowSchema, 'object');
            break;
          }
        }
        if (rowObject?.arguments[0]?.properties?.length) break;
      }
    }
    const rowResolved = resolveIdentifier(rowSchema, rowContext);
    const rowSourceResolved = resolveIdentifier(rowSourceSchema, rowSourceContext);
    rowObject = schemaCall(expandSchema(rowResolved.node, rowResolved.context), 'object');
    let fields = schemaProperties(rowObject, rowResolved.context).map(prop => describeField(
      propertyName(prop.key),
      prop.value,
      rowResolved.context,
      `${prefix}-${key}`,
      depth + 1,
      rowSchemaBacked,
      rowSourceResolved.context,
    ));
    if (!fields.length && array && schemaCall(rowResolved.node, 'string')) {
      fields = [{ id: `${prefix}-${key}-value`, answerKey: 'value', label: ui.label, type: 'text', required: false }];
      descriptor.metadata = { itemType: 'string' };
    }
    descriptor.metadata = { ...descriptor.metadata, ...(object && !array ? { collection: 'object' } : {}), fields };
  }
  if (ui.element && descriptor.type === 'text') {
    const textareas = nodes(ui.element, node =>
      node.type === 'JSXElement' && ['Textarea', 'textarea'].includes(jsxName(node))
    ).map(({ node }) => node);
    if (textareas.some(node => fieldCalls(node, key).length > 0) ||
        (literal(attribute(ui.element, 'name')) === key && textareas.length === 1)) {
      descriptor.type = 'textarea';
    }
  }
  applyUiChoiceControl(descriptor, ui, context);
  if (ui.element) {
    const placeholder = nodes(ui.element, node => node.type === 'JSXElement' && ['Input', 'Textarea', 'Field'].includes(jsxName(node))).map(({ node }) => literal(attribute(node, 'placeholder'))).find(value => typeof value === 'string');
    if (placeholder) { descriptor.placeholder = placeholder; descriptor.metadata = { ...descriptor.metadata, originalPlaceholder: placeholder }; }
    const description = literal(attribute(ui.element, 'description'));
    if (typeof description === 'string') { descriptor.description = description; descriptor.metadata = { ...descriptor.metadata, originalDescription: description }; }
  }
  if (descriptor.type === 'yesNo') descriptor.options = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }];
  for (const ancestor of [...ui.ancestors].reverse()) {
    if (ancestor.type !== 'LogicalExpression' && ancestor.type !== 'ConditionalExpression') continue;
    const test = ancestor.test || ancestor.left;
    if (test?.type !== 'BinaryExpression' || !['===', '==', '!==', '!='].includes(test.operator)) continue;
    const left = resolveIdentifier(test.left, context).node;
    const watch = left?.type === 'CallExpression' && (left.callee?.property?.name || left.callee?.name) === 'watch' ? left : null;
    const sourceKey = literal(watch?.arguments[0]);
    const value = literal(test.right);
    if (sourceKey && sourceKey !== key && value !== undefined) { descriptor.visibleIf = [{ field: sourceKey, op: test.operator.includes('!') ? 'notEquals' : 'equals', value }]; break; }
  }
  descriptor.metadata = { ...descriptor.metadata, originalLabel: descriptor.label, ...(descriptor.options ? { originalOptions: structuredClone(descriptor.options) } : {}) };
  return descriptor;
}
function mainSchema(context) {
  const defaultExport = context.ast.program.body.find(node => node.type === 'ExportDefaultDeclaration');
  const form = nodes(defaultExport || context.ast, node => node.type === 'CallExpression' && node.callee?.name === 'useForm')[0]?.node;
  const resolver = nodes(form, node => node.type === 'CallExpression' && node.callee?.name === 'zodResolver')[0]?.node;
  if (resolver) return { ...resolveIdentifier(resolver.arguments[0]?.type === 'ConditionalExpression' ? resolver.arguments[0].alternate : resolver.arguments[0], context), schemaBacked: true };
  const defaults = form?.arguments[0]?.properties?.find(prop => propertyName(prop.key) === 'defaultValues')?.value;
  function inferDefault(node) {
    const resolved = resolveIdentifier(node, context).node;
    const call = (name, args = []) => ({ type: 'CallExpression', callee: { type: 'MemberExpression', object: { type: 'Identifier', name: 'z' }, property: { type: 'Identifier', name } }, arguments: args });
    if (resolved?.type === 'ObjectExpression') return call('object', [{ ...resolved, properties: resolved.properties.filter(prop => prop.type === 'ObjectProperty').map(prop => ({ ...prop, value: inferDefault(prop.value) })) }]);
    if (resolved?.type === 'ArrayExpression') return call('array', [call('any')]);
    if (['yes', 'no'].includes(literal(resolved))) return call('enum', [{ type: 'ArrayExpression', elements: ['yes', 'no'].map(value => ({ type: 'StringLiteral', value })) }]);
    return call('string');
  }
  if (defaults) return { node: inferDefault(defaults), context, schemaBacked: false };
  for (const [name, node] of context.variables) if (/^(formSchema|contactFormSchema|custodySchema)$/.test(name) && schemaCall(node, 'object')) return { node, context, schemaBacked: true };
  return null;
}
function extractPage(route, title, sectionKey, profileRole) {
  const fileRoute = route.replace('/children/child-profile/', '/children/[childId]/').replace('/non-migrating/member-profile/', '/non-migrating/[memberId]/');
  const file = path.join(clientRoot, 'app', fileRoute.slice(1), 'page.js');
  if (!fs.existsSync(file)) return null;
  const context = readFile(file);
  const schema = mainSchema(context);
  const object = schema && schemaCall(expandSchema(schema.node, schema.context), 'object');
  const id = route.replace(/^\/intake\//, '').replace(/\//g, '-');
  let questions = schemaProperties(object, schema?.context || context).map(prop => describeField(
    propertyName(prop.key),
    prop.value,
    context,
    id,
    0,
    schema?.schemaBacked === true,
    schema?.context || context,
  ));
  if (!questions.length && route.endsWith('/spouse-partner/identity') && route.includes('/partner/')) {
    const template = extractPage('/intake/temporary-work/spouse-partner/identity', title, 'partner_spouse_identity', profileRole);
    questions = structuredClone(template.questions);
    const rename = question => { question.id = question.id.replace('temporary-work-spouse-partner-identity', id); question.metadata?.fields?.forEach(rename); };
    questions.forEach(rename);
  }
  if (!questions.length && route.endsWith('/all-applicants/languages')) {
    const fields = schemaProperties(schemaCall(context.variables.get('languageRowSchema'), 'object'), context).filter(prop => propertyName(prop.key) !== 'preference_order').map(prop => describeField(propertyName(prop.key), prop.value, context, `${id}-languages`));
    fields.forEach(field => {
      if (['speak', 'read', 'write'].includes(field.answerKey)) {
        field.type = 'checkbox';
        // z.boolean() requires a boolean value, while a required checkbox in
        // the dynamic renderer means it must be checked. The row superRefine
        // separately enforces that at least one language ability is selected.
        field.required = false;
      }
    });
    questions = [{ id: `${id}-applicants`, answerKey: 'applicants', label: 'Applicants', type: 'repeater', required: false, metadata: { originalLabel: 'Applicants', fields: [
      { id: `${id}-applicant-name`, answerKey: 'name', label: 'Applicant', type: 'text', required: false, metadata: { originalLabel: 'Applicant' } },
      { id: `${id}-languages`, answerKey: 'languages', label: 'Languages', type: 'repeater', required: false, metadata: { originalLabel: 'Languages', fields } },
    ] } }];
  }
  if (!questions.length) {
    const seen = new Set();
    questions = nodes(context.ast, node => node.type === 'CallExpression' && node.callee?.property?.name === 'register' && typeof literal(node.arguments[0]) === 'string').map(({ node }) => literal(node.arguments[0])).filter(key => !key.includes('.') && !seen.has(key) && seen.add(key)).map(key => describeField(key, null, context, id));
  }
  // UI-only import-review and compatibility fields are not questionnaire questions.
  questions = questions.filter(question => !['identity_import_review', 'close_contact_tb', 'tuberculosis_exposure_details', 'health_conditions_list', 'health_insurance', 'health_insurance_details'].includes(question.answerKey));
  const passportContext = readFile(path.join(clientRoot, 'src/components/intake/PassportDocumentsSection.js'));
  const citizenshipContext = readFile(path.join(clientRoot, 'src/components/intake/target-visas/TargetCitizenshipDialog.jsx'));
  function completeRows(question) {
    if (question.type === 'repeater' && !question.metadata.fields.length) {
      let extraContext;
      let extraSchema;
      if (question.answerKey === 'passports') { extraContext = passportContext; extraSchema = passportContext.variables.get('passportDialogSchema'); }
      if (question.answerKey === 'citizenships') { extraContext = citizenshipContext; extraSchema = citizenshipContext.variables.get('citizenshipRowSchema'); }
      const extraObject = schemaCall(extraSchema, 'object');
      if (extraObject) question.metadata.fields = extraObject.arguments[0].properties.filter(prop => prop.type === 'ObjectProperty').map(prop => describeField(propertyName(prop.key), prop.value, extraContext, question.id));
      if (!question.metadata.fields.length) question.metadata.fields = [{ id: `${question.id}-details`.slice(0, 128), answerKey: 'details', label: 'Details', type: 'textarea', required: false, metadata: { originalLabel: 'Details' } }];
    }
    question.metadata?.fields?.forEach(completeRows);
  }
  questions.forEach(completeRows);
  if (!questions.length) { console.warn(`No questions: ${route}`); return null; }
  const titleNode = nodes(context.ast, node => node.type === 'JSXElement' && jsxName(node) === 'CardTitle')[0]?.node;
  const originalTitle = cleanLabel(textOf(titleNode)) || title;
  const titleIncludesPerson = nodes(titleNode, node => node.type === 'Identifier' && /^(?:activeProfile|profile|spouseName|given_names|family_name)$/.test(node.name)).length > 0;
  const cardHeader = nodes(context.ast, node => node.type === 'JSXElement' && jsxName(node) === 'CardHeader')[0]?.node;
  const introBlocks = nodes(cardHeader, node => node.type === 'JSXElement' && jsxName(node) === 'p').map(({ node }) => cleanLabel(textOf(node))).filter(Boolean).map(text => ({ type: 'paragraph', text }));
  const visaType = route.split('/')[2];
  const storageCalls = nodes(context.ast, node => node.type === 'CallExpression' && node.callee?.property?.name === 'saveSectionData').map(({ node }) => literal(node.arguments[0])).filter(value => typeof value === 'string');
  let storagePath = storageCalls.find(value => value.startsWith(visaType.replace(/-/g, '_')) || (visaType === 'partner' && /^(mainApplicant|familySponsor)\./.test(value))) || sectionKey;
  if (route === '/intake/partner/spouse-partner/details') storagePath = 'spousePartner.details';
  const profileSection = nodes(context.ast, node => node.type === 'CallExpression' && node.callee?.property?.name === 'saveProfileSectionData').map(({ node }) => literal(node.arguments[1])).find(value => typeof value === 'string');
  return { id, route, title, sectionKey: storagePath.includes('.') ? id.replace(/-/g, '_') : storagePath, completionKey: route.replace(/^\/intake\//, ''), scope: profileRole ? 'profile' : 'shared', order: 0, introBlocks, metadata: { renderer: 'legacy', builtInPageId: id, storagePath, ...(route.endsWith('/all-applicants/languages') ? { answerLayout: 'applicantLanguages' } : {}), ...(profileSection ? { profileSection } : {}), originalTitle, titleIncludesPerson, originalIntroBlocks: structuredClone(introBlocks), ...(profileRole ? { profileRole } : {}) }, questions };
}
async function main() {
  const routeModule = await import(pathToFileURL(path.join(clientRoot, 'src/lib/routes.js')).href);
  const { getIntakeRoutes } = routeModule;
  const pages = [];
  for (const visaType of ['temporary-work', 'partner', 'protection']) {
    const routes = (visaType === 'temporary-work' ? ['482', '186'] : [null]).flatMap(context => getIntakeRoutes(visaType, context).flatMap(section => section.subpages || [section])).filter(route => !/\/(?:start|profile|submit)$/.test(route.href));
    const profileLists = visaType === 'temporary-work'
      ? [routeModule.PROFILE_SUBPAGES, routeModule.TEMPORARY_WORK_482_SPOUSE_PROFILE_SUBPAGES, routeModule.EMPLOYER_NOMINATION_SPOUSE_PROFILE_SUBPAGES]
      : visaType === 'partner' ? [routeModule.PARTNER_MAIN_APPLICANT_PROFILE_SUBPAGES, routeModule.PARTNER_SPOUSE_PROFILE_SUBPAGES]
        : [routeModule.PROTECTION_MAIN_APPLICANT_PROFILE_SUBPAGES, routeModule.PROTECTION_SPOUSE_PROFILE_SUBPAGES];
    profileLists.filter(Boolean).forEach(list => routes.push(...list));
    for (const suffix of ['details', 'other', 'identity', 'custody']) routes.push({ href: `/intake/${visaType}/children/child-profile/${suffix}`, title: suffix === 'other' ? 'Other Names' : formatLabel(suffix) });
    for (const suffix of ['details', 'passport', 'identity', 'other-names', 'citizenship', 'health']) routes.push({ href: `/intake/${visaType}/non-migrating/member-profile/${suffix}`, title: formatLabel(suffix.replace(/-/g, '_')) });
    for (const route of [...new Map(routes.map(route => [route.href, route])).values()]) {
      const match = route.href.match(/\/(main-applicant|spouse-partner|children|non-migrating)\//);
      const role = match ? { 'main-applicant': 'main_applicant', 'spouse-partner': 'spouse', children: 'child', 'non-migrating': 'non_migrating' }[match[1]] : null;
      let suffix = route.href.split('/').pop().replace(/-/g, '_');
      suffix = ({ other: 'other_names', other_details: 'other_names', travel_history: 'travel' })[suffix] || suffix;
      const sectionKey = visaType === 'temporary-work' ? `temporary_work_${suffix}` : visaType === 'protection' ? `protection_${suffix}` : match?.[1] === 'main-applicant' ? `mainApplicant.${({ other_names: 'otherNames' })[suffix] || suffix}` : `partner_${suffix}`;
      const page = extractPage(route.href, route.title, sectionKey, role);
      if (page) { page.order = (pages.length + 1) * 10; pages.push(page); }
    }
  }
  fs.writeFileSync(outputPath, `// Generated from shipped client questionnaire forms by scripts/extract-questionnaire-built-ins.cjs.\n// Kept in this repository so fallback rendering never depends on a sibling checkout.\nexport const questionnaireBuiltInPages = ${JSON.stringify(pages, null, 2)};\n`);
  console.log(`Extracted ${pages.length} pages into ${outputPath}`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
