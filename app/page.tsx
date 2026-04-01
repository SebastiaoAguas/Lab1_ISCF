"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';

// Ligar ao Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Tipo para o histórico de alertas
interface Alerta {
  id: number;
  timestamp: string;
  eixo: string;
  valor: number;
  limite: number;
}

export default function Dashboard() {
  const [dadosSensores, setDadosSensores] = useState<any[]>([]);
  const [cadencia, setCadencia] = useState<number>(1000);
  const [tempoRelatorio, setTempoRelatorio] = useState<number>(10);
  const [aGerar, setAGerar] = useState<boolean>(false);

  // --- ESTADOS DO SISTEMA DE ALERTAS ---
  const [limiteAtivo, setLimiteAtivo] = useState<boolean>(false);
  const [limiteX, setLimiteX] = useState<number>(1.0);
  const [limiteY, setLimiteY] = useState<number>(1.0);
  const [limiteZ, setLimiteZ] = useState<number>(1.0);
  const [limiteInputX, setLimiteInputX] = useState<string>("1.0");
  const [limiteInputY, setLimiteInputY] = useState<string>("1.0");
  const [limiteInputZ, setLimiteInputZ] = useState<string>("1.0");
  const [alertaAtivo, setAlertaAtivo] = useState<boolean>(false);
  const [alertaInfo, setAlertaInfo] = useState<{ eixo: string; valor: number; limite: number } | null>(null);
  const [historicoAlertas, setHistoricoAlertas] = useState<Alerta[]>([]);
  const alertaIdRef = useRef<number>(0);
  const alertaTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Verifica threshold no novo dado recebido
  const verificarThreshold = useCallback((linha: any, limites: { x: number; y: number; z: number }) => {
    const eixosMap: { [key: string]: number } = { x: limites.x, y: limites.y, z: limites.z };
    for (const eixo of ['x', 'y', 'z']) {
      const valor = Math.abs(Number(linha[eixo]));
      const limite = eixosMap[eixo];
      if (!isNaN(valor) && valor > limite) {
        // Disparar alerta visual
        setAlertaAtivo(true);
        setAlertaInfo({ eixo: eixo.toUpperCase(), valor: Number(linha[eixo]), limite });

        // Adicionar ao histórico
        const novoAlerta: Alerta = {
          id: ++alertaIdRef.current,
          timestamp: new Date().toLocaleTimeString('pt-PT'),
          eixo: eixo.toUpperCase(),
          valor: Number(linha[eixo]),
          limite: limite,
        };
        setHistoricoAlertas((prev) => [novoAlerta, ...prev].slice(0, 10));

        // Auto-fechar o banner após 4 segundos
        if (alertaTimeoutRef.current) clearTimeout(alertaTimeoutRef.current);
        alertaTimeoutRef.current = setTimeout(() => setAlertaAtivo(false), 4000);
        break; // apenas dispara 1 alerta por ciclo (o primeiro eixo que ultrapassa)
      }
    }
  }, []);

  // ==========================================
  // 1. LÓGICA DO GRÁFICO E CADÊNCIA (POLLING)
  // ==========================================
  useEffect(() => {
    const fetchDadosIniciais = async () => {
      const { data } = await supabase
        .from('sensor_data')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(20);

      if (data) {
        setDadosSensores(data.reverse());
      }
    };

    fetchDadosIniciais();

    const buscarUltimoRegisto = async () => {
      const { data } = await supabase
        .from('sensor_data')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        const ultimaLinha = data[0];

        // Verificar threshold se estiver ativo
        if (limiteAtivo) {
          verificarThreshold(ultimaLinha, { x: limiteX, y: limiteY, z: limiteZ });
        }

        setDadosSensores((dadosAntigos) => {
          const novosDados = [...dadosAntigos, ultimaLinha];
          if (novosDados.length > 20) novosDados.shift();
          return novosDados;
        });
      }
    };

    const temporizador = setInterval(buscarUltimoRegisto, cadencia);
    return () => clearInterval(temporizador);
  }, [cadencia, limiteAtivo, limiteX, limiteY, limiteZ, verificarThreshold]);


  // ==========================================
  // 2. LÓGICA DO RELATÓRIO E ESTATÍSTICAS
  // ==========================================
  const gerarRelatorio = async () => {
    setAGerar(true);
    try {
      const dataLimite = new Date();
      dataLimite.setSeconds(dataLimite.getSeconds() - tempoRelatorio);
      const dataISO = dataLimite.toISOString();

      const { data, error } = await supabase
        .from('sensor_data')
        .select('*')
        .gte('timestamp', dataISO);

      if (error) throw error;
      if (!data || data.length === 0) {
        alert("Não há dados nesse período de tempo!");
        setAGerar(false);
        return;
      }

      const calcularStats = (eixo: string) => {
        const valores = data.map(d => Number(d[eixo]));
        const max = Math.max(...valores);
        const min = Math.min(...valores);
        const media = valores.reduce((a, b) => a + b, 0) / valores.length;
        return { max: max.toFixed(3), min: min.toFixed(3), media: media.toFixed(3) };
      };

      const statsX = calcularStats('x');
      const statsY = calcularStats('y');
      const statsZ = calcularStats('z');

      const conteudoCSV =
        `Relatorio de Telemetria - Ultimos ${tempoRelatorio} segundos\n` +
        `Eixo,Minimo,Maximo,Media\n` +
        `X,${statsX.min},${statsX.max},${statsX.media}\n` +
        `Y,${statsY.min},${statsY.max},${statsY.media}\n` +
        `Z,${statsZ.min},${statsZ.max},${statsZ.media}\n`;

      const blob = new Blob([conteudoCSV], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `relatorio_robo_${tempoRelatorio}s.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

    } catch (err) {
      console.error("Erro ao gerar relatório:", err);
      alert("Ocorreu um erro ao gerar o relatório.");
    } finally {
      setAGerar(false);
    }
  };

  // Ativar alerta com o valor do input
  const ativarAlerta = () => {
    const valX = parseFloat(limiteInputX);
    const valY = parseFloat(limiteInputY);
    const valZ = parseFloat(limiteInputZ);
    if (isNaN(valX) || valX <= 0 || isNaN(valY) || valY <= 0 || isNaN(valZ) || valZ <= 0) {
      alert("Insere valores de limite válidos (números positivos) para todos os eixos.");
      return;
    }
    setLimiteX(valX);
    setLimiteY(valY);
    setLimiteZ(valZ);
    setLimiteAtivo(true);
    setHistoricoAlertas([]);
  };

  const desativarAlerta = () => {
    setLimiteAtivo(false);
    setAlertaAtivo(false);
    if (alertaTimeoutRef.current) clearTimeout(alertaTimeoutRef.current);
  };


  // ==========================================
  // 3. INTERFACE (UI)
  // ==========================================
  return (
    <div className="p-8 font-sans bg-slate-50 min-h-screen text-slate-800">
      <h1 className="text-3xl font-bold mb-6 text-blue-600">Dashboard de Telemetria do Robô</h1>

      {/* ===== BANNER DE ALERTA ===== */}
      {alertaAtivo && alertaInfo && (
        <div
          className="mb-6 flex items-center gap-4 bg-red-600 text-white px-6 py-4 rounded-lg shadow-xl animate-pulse"
          role="alert"
        >
          <span className="text-3xl">🚨</span>
          <div className="flex-1">
            <p className="font-bold text-lg">ALERTA DE ACELERAÇÃO EXCEDIDA!</p>
            <p className="text-sm">
              Eixo <strong>{alertaInfo.eixo}</strong> atingiu{' '}
              <strong>{alertaInfo.valor.toFixed(4)}</strong> — Limite: ±{alertaInfo.limite}
            </p>
          </div>
          <button
            onClick={() => setAlertaAtivo(false)}
            className="text-white font-bold text-xl hover:text-red-200 transition-colors"
          >
            ✕
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">

        {/* Controlo de Cadência */}
        <div className="bg-white p-6 rounded-lg shadow-lg border-l-4 border-blue-500">
          <h3 className="text-lg font-semibold mb-2">Monitorização</h3>
          <p className="text-sm text-gray-500 mb-4">Velocidade de atualização do gráfico.</p>
          <div className="flex items-center">
            <label htmlFor="cadencia" className="mr-3 font-medium text-gray-700">Cadência:</label>
            <select
              id="cadencia"
              value={cadencia}
              onChange={(e) => setCadencia(parseInt(e.target.value))}
              className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2.5"
            >
              <option value={500}>0.5 Segundos</option>
              <option value={1000}>1 Segundo</option>
              <option value={2000}>2 Segundos</option>
              <option value={5000}>5 Segundos</option>
              <option value={10000}>10 Segundos</option>
              <option value={20000}>20 Segundos</option>
              <option value={30000}>30 Segundos</option>
            </select>
          </div>
        </div>

        {/* Geração de Relatório */}
        <div className="bg-white p-6 rounded-lg shadow-lg border-l-4 border-green-500">
          <h3 className="text-lg font-semibold mb-2">Relatórios Automáticos</h3>
          <p className="text-sm text-gray-500 mb-4">Exportar estatísticas do acelerómetro (CSV).</p>
          <div className="flex items-center gap-4">
            <select
              value={tempoRelatorio}
              onChange={(e) => setTempoRelatorio(parseInt(e.target.value))}
              className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-green-500 focus:border-green-500 p-2.5"
            >
              <option value={10}>Últimos 10 Segundos</option>
              <option value={20}>Últimos 20 Segundos</option>
              <option value={30}>Últimos 30 Segundos</option>
              <option value={600}>Últimos 10 Minutos (600s)</option>
              <option value={1800}>Últimos 30 Minutos (1800s)</option>
            </select>

            <button
              onClick={gerarRelatorio}
              disabled={aGerar}
              className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50 transition-colors"
            >
              {aGerar ? 'A processar...' : 'Download Relatório'}
            </button>
          </div>
        </div>

        {/* ===== PAINEL DE ALERTAS ===== */}
        <div className={`bg-white p-6 rounded-lg shadow-lg border-l-4 ${limiteAtivo ? 'border-red-500' : 'border-orange-400'}`}>
          <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
            {limiteAtivo ? <span className="text-red-500">🔴</span> : <span className="text-orange-400">🔶</span>}
            Alertas de Aceleração
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            Dispara quando qualquer eixo ultrapassa o limite (valor absoluto).
          </p>
          <div className="space-y-2 mb-3">
            {([
              { label: 'X ±', value: limiteInputX, setter: setLimiteInputX, id: 'limiteInputX' },
              { label: 'Y ±', value: limiteInputY, setter: setLimiteInputY, id: 'limiteInputY' },
              { label: 'Z ±', value: limiteInputZ, setter: setLimiteInputZ, id: 'limiteInputZ' },
            ] as { label: string; value: string; setter: (v: string) => void; id: string }[]).map(({ label, value, setter, id }) => (
              <div key={id} className="flex items-center gap-2">
                <label htmlFor={id} className="font-medium text-gray-700 text-sm w-8">{label}</label>
                <input
                  id={id}
                  type="number"
                  min="0"
                  step="0.1"
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                  disabled={limiteAtivo}
                  className="w-24 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg p-2 focus:ring-orange-400 focus:border-orange-400 disabled:opacity-50"
                />
                <span className="text-sm text-gray-500">m/s²</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={ativarAlerta}
              disabled={limiteAtivo}
              className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white font-bold py-2 px-3 rounded text-sm transition-colors"
            >
              Ativar
            </button>
            <button
              onClick={desativarAlerta}
              disabled={!limiteAtivo}
              className="flex-1 bg-gray-400 hover:bg-gray-500 disabled:opacity-40 text-white font-bold py-2 px-3 rounded text-sm transition-colors"
            >
              Desativar
            </button>
          </div>
          {limiteAtivo && (
            <p className="mt-2 text-xs text-red-600 font-semibold text-center">
              ● ATIVA — X:±{limiteX} Y:±{limiteY} Z:±{limiteZ} m/s²
            </p>
          )}
        </div>

      </div>

      {/* ÁREA DO GRÁFICO */}
      <div className="bg-white p-6 rounded-lg shadow-lg mb-6">
        <h2 className="text-xl font-semibold mb-4 flex justify-between">
          <span>Acelerómetro (CoppeliaSim)</span>
          <span className="text-sm text-gray-400 font-normal">Atualiza a cada {cadencia / 1000}s</span>
        </h2>

        <div className="h-96 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dadosSensores}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="timestamp" hide={true} />
              <YAxis domain={['auto', 'auto']} />
              <Tooltip />
              <Legend />
              {/* Linhas de referência do threshold */}
              {limiteAtivo && (
                <>
                  <ReferenceLine y={limiteX} stroke="#ef4444" strokeDasharray="6 3" label={{ value: `+X${limiteX}`, fill: '#ef4444', fontSize: 11 }} />
                  <ReferenceLine y={-limiteX} stroke="#ef4444" strokeDasharray="6 3" label={{ value: `-X${limiteX}`, fill: '#ef4444', fontSize: 11 }} />
                  <ReferenceLine y={limiteY} stroke="#22c55e" strokeDasharray="6 3" label={{ value: `+Y${limiteY}`, fill: '#22c55e', fontSize: 11 }} />
                  <ReferenceLine y={-limiteY} stroke="#22c55e" strokeDasharray="6 3" label={{ value: `-Y${limiteY}`, fill: '#22c55e', fontSize: 11 }} />
                  <ReferenceLine y={limiteZ} stroke="#3b82f6" strokeDasharray="6 3" label={{ value: `+Z${limiteZ}`, fill: '#3b82f6', fontSize: 11 }} />
                  <ReferenceLine y={-limiteZ} stroke="#3b82f6" strokeDasharray="6 3" label={{ value: `-Z${limiteZ}`, fill: '#3b82f6', fontSize: 11 }} />
                </>
              )}
              <Line type="monotone" dataKey="x" stroke="#ef4444" strokeWidth={2} name="Eixo X" isAnimationActive={false} />
              <Line type="monotone" dataKey="y" stroke="#22c55e" strokeWidth={2} name="Eixo Y" isAnimationActive={false} />
              <Line type="monotone" dataKey="z" stroke="#3b82f6" strokeWidth={2} name="Eixo Z" isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ===== HISTÓRICO DE ALERTAS ===== */}
      {historicoAlertas.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow-lg border-t-4 border-red-400">
          <h2 className="text-xl font-semibold mb-4 text-red-600 flex items-center gap-2">
            🚨 Histórico de Alertas
            <span className="ml-2 text-sm bg-red-100 text-red-700 rounded-full px-2 py-0.5">{historicoAlertas.length}</span>
            <button
              onClick={() => setHistoricoAlertas([])}
              className="ml-auto text-xs text-gray-400 hover:text-red-500 transition-colors"
            >
              Limpar
            </button>
          </h2>
          <table className="w-full text-sm text-left">
            <thead className="bg-red-50 text-red-800 uppercase text-xs">
              <tr>
                <th className="px-4 py-2 rounded-tl">Hora</th>
                <th className="px-4 py-2">Eixo</th>
                <th className="px-4 py-2">Valor Lido</th>
                <th className="px-4 py-2 rounded-tr">Limite Definido</th>
              </tr>
            </thead>
            <tbody>
              {historicoAlertas.map((a, i) => (
                <tr key={a.id} className={i % 2 === 0 ? 'bg-white' : 'bg-red-50'}>
                  <td className="px-4 py-2 font-mono text-gray-600">{a.timestamp}</td>
                  <td className="px-4 py-2 font-bold text-red-600">{a.eixo}</td>
                  <td className="px-4 py-2">{a.valor.toFixed(4)}</td>
                  <td className="px-4 py-2 text-gray-500">±{a.limite}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}