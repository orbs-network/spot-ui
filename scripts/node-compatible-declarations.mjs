import { writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import ts from 'typescript'

const declarationPattern = /\.d\.(?:ts|mts|cts)$/

/** Rewrite only module specifiers, preserving declaration formatting and comments. */
export function rewriteDeclarationImports(filePath, content, declarationFiles, format = 'esm') {
  const source = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true)
  const edits = []

  const visitSpecifier = (specifier) => {
    if (!specifier || !ts.isStringLiteralLike(specifier)) return
    const name = specifier.text
    if (!/^\.{1,2}(?:\/|$)/.test(name) || name.endsWith('.json')) return

    const target = resolve(dirname(filePath), name)
    const extension = format === 'cjs' ? '.cjs' : '.js'
    const candidates = [
      [target + '.d.ts', name + extension],
      [resolve(target, 'index.d.ts'), name.replace(/\/$/, '') + '/index' + extension],
      [target + '.d.mts', name + '.mjs'],
      [resolve(target, 'index.d.mts'), name.replace(/\/$/, '') + '/index.mjs'],
      [target + '.d.cts', name + '.cjs'],
      [resolve(target, 'index.d.cts'), name.replace(/\/$/, '') + '/index.cjs'],
    ]
    if (name.endsWith('.js') || name.endsWith('.ts')) {
      candidates.unshift([target.slice(0, -3) + '.d.ts', name.slice(0, -3) + extension])
    } else if (name.endsWith('.mjs') || name.endsWith('.mts')) {
      candidates.unshift([target.slice(0, -4) + '.d.mts', name.slice(0, -4) + '.mjs'])
    } else if (name.endsWith('.cjs') || name.endsWith('.cts')) {
      candidates.unshift([target.slice(0, -4) + '.d.cts', name.slice(0, -4) + '.cjs'])
    }
    const replacement = candidates.find(([path]) => declarationFiles.has(path))?.[1]
    if (!replacement) {
      throw new Error(`Cannot resolve declaration import ${JSON.stringify(name)} in ${filePath}`)
    }
    edits.push({ start: specifier.getStart(source) + 1, end: specifier.end - 1, text: replacement })
  }

  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      visitSpecifier(node.moduleSpecifier)
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      visitSpecifier(node.argument.literal)
    } else if (ts.isExternalModuleReference(node)) {
      visitSpecifier(node.expression)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)

  for (const edit of edits.sort((left, right) => right.start - left.start)) {
    content = content.slice(0, edit.start) + edit.text + content.slice(edit.end)
  }
  return content
}

/** vite-plugin-dts hook; all declaration targets exist before resolving directories. */
export async function finalizeNodeDeclarations(emittedFiles) {
  const declarationFiles = new Set(
    [...emittedFiles.keys()].filter(path => declarationPattern.test(path)).map(path => resolve(path)),
  )
  for (const [filePath, content] of [...emittedFiles]) {
    if (!declarationPattern.test(filePath)) continue
    const rewritten = rewriteDeclarationImports(resolve(filePath), content, declarationFiles)
    if (rewritten !== content) {
      await writeFile(filePath, rewritten)
      emittedFiles.set(filePath, rewritten)
    }
    if (filePath.endsWith('.d.ts')) {
      const commonJsPath = filePath.replace(/\.d\.ts$/, '.d.cts')
      // A declaration map describes the original .d.ts positions, not this mirror.
      const commonJsContent = rewriteDeclarationImports(resolve(filePath), content, declarationFiles, 'cjs')
        .replace(/^\/\/# sourceMappingURL=.*(?:\r?\n|$)/gm, '')
      await writeFile(commonJsPath, commonJsContent)
      emittedFiles.set(commonJsPath, commonJsContent)
    }
  }
}
