import { Injectable } from '@angular/core';
import { CodingQuestion } from '../../models/codingQuestion.model';

@Injectable({
  providedIn: 'root',
})
export class CodeGeneratorService {
  generateCodeTemplate(question: CodingQuestion, language: string): string {
    switch (language) {
      case 'python':
        return this.generatePythonCode(question);
      case 'javascript':
        return this.generateJavaScriptCode(question);
      default:
        throw new Error('Unsupported language');
    }
  }

  generatePythonCode(question: CodingQuestion): string {
    const args = question.functionSignature.arguments
      .map((arg) => arg.name)
      .join(', ');

    const adjustedParsers = question.functionSignature.arguments.map((arg) => {
      const name = arg.name;
      switch (arg.type) {
        case 'int':
          return `    ${name} = int(input().strip())`;
        case 'string':
          return `    ${name} = input().strip()`;
        case 'boolean':
          return `    ${name} = input().strip().lower() == "true"`;
        case 'int[]':
          return `    ${name} = list(map(int, input().strip().split(',')))`;
        case 'string[]':
          return `    ${name} = input().strip().split(',')`;
        default:
          return `    ${name} = input().strip()`;
      }
    });

    const callArguments = question.functionSignature.arguments
      .map((arg) => arg.name)
      .join(', ');

    const outputHandling = question.functionSignature.returnType.endsWith('[]')
      ? 'print(",".join(map(str, output)))'
      : 'print(output)';

    return `def ${question.functionName}(${args}):
    # Your code here
    pass

if __name__ == "__main__":
${adjustedParsers.join('\n')}
    output = ${question.functionName}(${callArguments})
    ${outputHandling}`;
  }

  generateJavaScriptCode(question: CodingQuestion) {
    const args = question.functionSignature.arguments
      .map((arg) => arg.name)
      .join(', ');

    const adjustedParsers = question.functionSignature.arguments.map(
      (arg, index) => {
        const name = arg.name;
        switch (arg.type) {
          case 'int':
            return `  const ${name} = parseInt(inputArray[${index}].trim(), 10);`;
          case 'string':
            return `  const ${name} = inputArray[${index}].trim();`;
          case 'boolean':
            return `  const ${name} = inputArray[${index}].trim().toLowerCase() === "true";`;
          case 'int[]':
            return `  const ${name} = inputArray[${index}].trim().split(',').map(Number);`;
          case 'string[]':
            return `  const ${name} = inputArray[${index}].trim().split(',');`;
          default:
            return `  const ${name} = inputArray[${index}].trim();`;
        }
      },
    );

    const callArguments = question.functionSignature.arguments
      .map((arg) => arg.name)
      .join(', ');

    const outputHandling = question.functionSignature.returnType.endsWith('[]')
      ? "console.log(output.join(','));"
      : 'console.log(output);';

    return `function ${question.functionName}(${args}) {
  // Your code here
}

process.stdin.on('data', data => {
  const inputArray = data.toString().trim().split('\\n');
${adjustedParsers.join('\n')}
  const output = ${question.functionName}(${callArguments});
  ${outputHandling}
});`;
  }
}
