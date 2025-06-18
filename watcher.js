import chokidar from 'chokidar';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';

const paths = {
    pinnacle: './classified_pinnacle',
    bet365: './python/raw_bet365_asian'
};

function arquivosProntos() {
    const hasPinnacle = fs.readdirSync(paths.pinnacle).some(f => f.startsWith('pinnacle_classificado_') && f.endsWith('.json'));
    const hasBet365 = fs.readdirSync(paths.bet365).some(f => f.endsWith('.txt'));
    return hasPinnacle && hasBet365;
}

let rodando = false;
let lastFileSize = 0;
let fileStableCount = 0;

function rodarScripts() {
    if (rodando) return;
    rodando = true;

    console.log('📦 Arquivos detectados. Processando Bet365...');
    
    // Primeiro processa o arquivo txt
    exec('node rawBet365.js', (err) => {
        if (err) {
            console.error('Erro no processamento Bet365:', err.message);
            rodando = false;
            return;
        }
        console.log('✅ Bet365 processado');

        // Verifica se o arquivo organized.json foi criado
        if (!fs.existsSync(path.join(paths.bet365, 'bet365_organized.json'))) {
            console.error('❌ Arquivo bet365_organized.json não foi criado');
            rodando = false;
            return;
        }

        // Depois procura correspondência no Pinnacle
        exec('node merge.js', (err2, stdout) => {
            if (err2) {
                console.error('Erro na comparação:', err2.message);
            } else {
                console.log('✅ merge.js concluído');
                console.log(stdout);
            }
            rodando = false;
        });
    });
}

let debounceTimeout = null;

console.log('👀 Aguardando arquivos...');
chokidar.watch([paths.pinnacle, paths.bet365], { ignoreInitial: true }).on('add', (filePath) => {
    // Só processa se for o arquivo txt da Bet365
    if (!filePath.endsWith('.txt')) return;
    
    if (debounceTimeout) clearTimeout(debounceTimeout);
    
    // Verifica se o arquivo está estável (não está mais sendo modificado)
    const checkFileStability = () => {
        const currentSize = fs.statSync(filePath).size;
        
        if (currentSize === lastFileSize) {
            fileStableCount++;
            if (fileStableCount >= 3) { // Arquivo estável por 3 verificações
                if (arquivosProntos()) {
                    rodarScripts();
                }
                return;
            }
        } else {
            fileStableCount = 0;
            lastFileSize = currentSize;
        }
        
        // Verifica novamente em 2 segundos
        setTimeout(checkFileStability, 2000);
    };
    
    // Inicia a verificação de estabilidade
    lastFileSize = fs.statSync(filePath).size;
    fileStableCount = 0;
    checkFileStability();
});
