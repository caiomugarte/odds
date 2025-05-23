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

function rodarScripts() {
    console.log('📦 Arquivos detectados. Rodando processamento...');
    exec('node rawBet365.js', (err, stdout) => {
        if (err) return console.error('Erro no Bet365:', err.message);
        console.log('✅ rawBet365.js concluído');
        exec('node process_pinnacle.js', (err2, stdout2) => {
            if (err2) return console.error('Erro no Pinnacle:', err2.message);
            console.log('✅ process_pinnacle.js concluído');
            exec('node merge.js', (err3, stdout3) => {
                if (err3) return console.error('Erro na comparação:', err3.message);
                console.log('✅ merge.js.js concluído');
                console.log(stdout3);
            });
        });
    });
}

console.log('👀 Aguardando arquivos...');
chokidar.watch([paths.pinnacle, paths.bet365], { ignoreInitial: true }).on('add', (path) => {
    if (arquivosProntos()) {
        rodarScripts();
    }
});
