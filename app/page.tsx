"use client";

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// Ligar ao Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function Dashboard() {
  const [dadosSensores, setDadosSensores] = useState<any[]>([]);
  const [cadencia, setCadencia] = useState<number>(1000); // Começa em 1 segundo
  const [tempoRelatorio, setTempoRelatorio] = useState<number>(10); // AGORA EM SEGUNDOS (Começa em 10s)
  const [aGerar, setAGerar] = useState<boolean>(false);

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
        
        setDadosSensores((dadosAntigos) => {
          const novosDados = [...dadosAntigos, ultimaLinha];
          if (novosDados.length > 20) novosDados.shift();
          return novosDados;
        });
      }
    };

    const temporizador = setInterval(buscarUltimoRegisto, cadencia);
    return () => clearInterval(temporizador);
  }, [cadencia]);


  // ==========================================
  // 2. LÓGICA DO RELATÓRIO E ESTATÍSTICAS
  // ==========================================
  const gerarRelatorio = async () => {
    setAGerar(true);
    try {
      // NOVA LÓGICA: Calcular a data limite subtraindo SEGUNDOS (e não minutos)
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
      // O nome do ficheiro agora também reflete que são segundos (ex: relatorio_robo_10s.csv)
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


  // ==========================================
  // 3. INTERFACE (UI)
  // ==========================================
  return (
    <div className="p-8 font-sans bg-slate-50 min-h-screen text-slate-800">
      <h1 className="text-3xl font-bold mb-6 text-blue-600">Dashboard de Telemetria do Robô</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        
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
              {/* OPÇÕES ADICIONADAS AQUI */}
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
              {/* OPÇÕES ADICIONADAS AQUI (agora os values são em segundos) */}
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

      </div>

      {/* ÁREA DO GRÁFICO */}
      <div className="bg-white p-6 rounded-lg shadow-lg mb-8">
        <h2 className="text-xl font-semibold mb-4 flex justify-between">
          <span>Acelerómetro (CoppeliaSim)</span>
          <span className="text-sm text-gray-400 font-normal">Atualiza a cada {cadencia/1000}s</span>
        </h2>
        
        <div className="h-96 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dadosSensores}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="timestamp" hide={true} />
              <YAxis domain={['auto', 'auto']} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="x" stroke="#ef4444" strokeWidth={2} name="Eixo X" isAnimationActive={false} />
              <Line type="monotone" dataKey="y" stroke="#22c55e" strokeWidth={2} name="Eixo Y" isAnimationActive={false} />
              <Line type="monotone" dataKey="z" stroke="#3b82f6" strokeWidth={2} name="Eixo Z" isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}