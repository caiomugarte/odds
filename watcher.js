import chokidar from 'chokidar';
import { exec } from 'child_process';
import fs from 'fs';

const paths = {
    pinnacle: './python/raw_pinnacle',
    bet365: './python/raw_bet365_asian'
};

function arquivosProntos() {
    const hasPinnacle = fs.readdirSync(paths.pinnacle).some(f => f.startsWith('pinnacle_') && f.endsWith('.json'));
    const hasRelated = fs.readdirSync(paths.pinnacle).some(f => f.startsWith('related_') && f.endsWith('.json'));
    const hasBet365 = fs.readdirSync(paths.bet365).some(f => f.startsWith('bet365_asian_') && f.endsWith('.txt'));
    return hasPinnacle && hasRelated && hasBet365;
}

let rodando = false;

function rodarScripts() {
    if (rodando) return;
    rodando = true;

    console.log('📦 Arquivos detectados. Rodando processamento...');
    exec('node rawBet365.js', (err) => {
        if (err) {
            console.error('Erro no Bet365:', err.message);
            rodando = false;
            return;
        }
        console.log('✅ rawBet365.js concluído');

        exec('node process_pinnacle.js', (err2) => {
            if (err2) {
                console.error('Erro no Pinnacle:', err2.message);
                rodando = false;
                return;
            }
            console.log('✅ process_pinnacle.js concluído');

            const classificadoPath = './python/raw_pinnacle/pinnacle_classificado.json';
            if (!fs.existsSync(classificadoPath)) {
                console.error('❌ Arquivo pinnacle_classificado.json não encontrado. Abortando merge.');
                rodando = false;
                return;
            }

            exec('node merge.js', (err3, stdout3) => {
                if (err3) {
                    console.error('Erro na comparação:', err3.message);
                } else {
                    console.log('✅ merge.js concluído');
                    console.log(stdout3);
                }
                rodando = false; // libera para próxima execução
            });
        });
    });
}

let debounceTimeout = null;

console.log('👀 Aguardando arquivos...');
chokidar.watch([paths.pinnacle, paths.bet365], { ignoreInitial: true }).on('add', (path) => {
    if (debounceTimeout) clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
        if (arquivosProntos()) {
            rodarScripts();
        }
    }, 2000); // espera 2 segundos após o último arquivo ser adicionado
});
