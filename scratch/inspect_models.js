import fs from 'fs';
import { XMLParser } from 'fast-xml-parser';

const text = fs.readFileSync('public/resources/models.plist', 'utf8');
const parser = new XMLParser();
const jsonObj = parser.parse(text);

function findMachine(nodes, target, path = []) {
    for (const node of nodes) {
        const desc = node.description || node.string || '';
        const val = node.value || '';
        const id = `${desc}${val}`;
        
        if (val === target) {
            console.log('FOUND:', target);
            console.log('PATH IDs:', path);
            return true;
        }
        
        const children = node.array?.dict || node.children || [];
        const nextNodes = Array.isArray(children) ? children : [children];
        
        if (nextNodes.length > 0) {
            if (findMachine(nextNodes, target, [...path, id])) return true;
        }
    }
    return false;
}

// Note: real plist structure is different, this is a placeholder to show intent.
// I will use a more direct approach in App.tsx by logging to console if I could.
console.log('Inspecting macse30 path...');
