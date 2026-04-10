import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const HACCP_POINTS = [
  { id:"CCP1", label:"Réception matières premières", category:"Réception", limit:"T° ≤ 4°C (réfrigéré) / ≤ -18°C (congelé)", actions:["Mesure T° à réception","Contrôle aspect visuel & odeur","Vérification DLC/DDM","Refus si non-conforme"], freq:"À chaque livraison", status:"ok" },
  { id:"CCP2", label:"Stockage réfrigéré", category:"Stockage", limit:"T° entre 0°C et +4°C en continu", actions:["Relevé T° 2x/jour","Calibration sonde mensuelle","Séparation crus/cuits","FIFO obligatoire"], freq:"2x par jour", status:"warn" },
  { id:"CCP3", label:"Stockage congélation", category:"Stockage", limit:"T° ≤ -18°C en continu", actions:["Relevé T° quotidien","Pas de re-congélation","Étiquetage date de congélation"], freq:"1x par jour", status:"ok" },
  { id:"CCP4", label:"Cuisson", category:"Cuisson", limit:"T° à cœur ≥ 63°C (volaille ≥ 75°C)", actions:["Sonde à cœur obligatoire","Enregistrement T° et durée","Contrôle visuel cuisson"], freq:"À chaque cuisson", status:"ok" },
  { id:"CCP5", label:"Refroidissement rapide", category:"Cuisson", limit:"De +63°C à +10°C en moins de 2h", actions:["Cellule de refroidissement","Suivi courbe température","Enregistrement horodaté"], freq:"À chaque refroidissement", status:"ok" },
  { id:"CCP6", label:"Remise en température", category:"Service", limit:"T° à cœur ≥ 63°C en moins de 1h", actions:["Sonde à cœur obligatoire","Temps de remise en T° ≤ 1h","Pas de deuxième remise en T°"], freq:"À chaque service", status:"ok" },
  { id:"CCP7", label:"Maintien en température chaude", category:"Service", limit:"T° ≥ 63°C en permanence", actions:["Contrôle bain-marie","Relevé T° toutes les 2h","Élimination si T° < 63°C > 30min"], freq:"Toutes les 2h", status:"bad" },
]

const CHECKLIST_ITEMS = {
  ouverture: [
    { id:"o1", label:"Relevé températures frigos et congélateurs", ccp:true },
    { id:"o2", label:"Vérification dates de péremption (DLC/DDM)", ccp:true },
    { id:"o3", label:"Nettoyage et désinfection des plans de travail", ccp:false },
    { id:"o4", label:"Vérification état de propreté des équipements", ccp:false },
    { id:"o5", label:"Contrôle hygiène du personnel (tenues, mains)", ccp:false },
    { id:"o6", label:"Réapprovisionnement savon/essuie-mains", ccp:false },
  ],
  service: [
    { id:"s1", label:"Contrôle T° maintien en chaud (≥ 63°C)", ccp:true },
    { id:"s2", label:"Vérification vitrine réfrigérée (≤ 4°C)", ccp:true },
    { id:"s3", label:"Lavage mains après chaque manipulation", ccp:false },
    { id:"s4", label:"Changement de gants entre tâches différentes", ccp:false },
    { id:"s5", label:"Nettoyage surface toutes les 2h", ccp:false },
    { id:"s6", label:"Contrôle allergènes affichés et à jour", ccp:false },
  ],
  fermeture: [
    { id:"f1", label:"Relevé températures finales frigos", ccp:true },
    { id:"f2", label:"Élimination produits non conformes", ccp:true },
    { id:"f3", label:"Nettoyage complet cuisine et équipements", ccp:false },
    { id:"f4", label:"Désinfection surfaces de contact alimentaire", ccp:false },
    { id:"f5", label:"Nettoyage sol et évacuations", ccp:false },
    { id:"f6", label:"Sortie poubelles et nettoyage zone déchets", ccp:false },
  ],
}

const ALLERGENS = [
  { id:1, name:"Gluten", icon:"🌾", examples:"Blé, seigle, orge, avoine" },
  { id:2, name:"Crustacés", icon:"🦐", examples:"Crevettes, homard, crabe" },
  { id:3, name:"Œufs", icon:"🥚", examples:"Tous les types d'œufs" },
  { id:4, name:"Poissons", icon:"🐟", examples:"Tous les poissons" },
  { id:5, name:"Arachides", icon:"🥜", examples:"Cacahuètes, huile d'arachide" },
  { id:6, name:"Soja", icon:"🫘", examples:"Fèves, tofu, lécithine" },
  { id:7, name:"Lait", icon:"🥛", examples:"Fromage, beurre, crème" },
  { id:8, name:"Fruits à coque", icon:"🌰", examples:"Noix, amandes, noisettes" },
  { id:9, name:"Céleri", icon:"🌿", examples:"Céleri rave, branche" },
  { id:10, name:"Moutarde", icon:"🌻", examples:"Graines, huile, poudre" },
  { id:11, name:"Sésame", icon:"🌱", examples:"Graines, huile, tahini" },
  { id:12, name:"Sulfites", icon:"🍷", examples:"Vin, vinaigre, fruits séchés" },
  { id:13, name:"Lupin", icon:"🌼", examples:"Farine de lupin" },
  { id:14, name:"Mollusques", icon:"🐚", examples:"Huîtres, moules, coquilles" },
]

const REGLEMENTS = [
  { id:"r1", titre:"Paquet Hygiène européen", ref:"CE n°852/2004", desc:"Règlement de base sur l'hygiène des denrées alimentaires. Impose la mise en place d'un système HACCP.", categorie:"HACCP", priorite:"haute" },
  { id:"r2", titre:"Information allergènes", ref:"UE n°1169/2011", desc:"Obligation d'informer les consommateurs sur les 14 allergènes majeurs. Affichage obligatoire en restauration.", categorie:"Allergènes", priorite:"haute" },
  { id:"r3", titre:"Arrêté hygiène restauration", ref:"Arrêté 21/12/2009", desc:"Règles spécifiques d'hygiène applicables aux commerces de détail et à la restauration commerciale en France.", categorie:"Hygiène", priorite:"haute" },
  { id:"r4", titre:"Formation hygiène obligatoire", ref:"Art. L233-4 Code rural", desc:"Au moins un employé par établissement doit justifier d'une formation en hygiène alimentaire de 14h minimum.", categorie:"Formation", priorite:"haute" },
  { id:"r5", titre:"Températures réglementaires", ref:"Arrêté 29/09/1997", desc:"Définit les températures légales : +4°C max (réfrigéré), -18°C max (congelé), +63°C min (chaud).", categorie:"HACCP", priorite:"haute" },
  { id:"r6", titre:"Déclaration auprès de la DDPP", ref:"Art. R233-4", desc:"Tout établissement de restauration doit se déclarer auprès de la Direction Départementale de la Protection des Populations.", categorie:"Administration", priorite:"moyenne" },
]

const PLANS = [
  { id:"trial", label:"Essai gratuit", price:"0€", color:"#888" },
  { id:"starter", label:"Starter", price:"29€/mois", color:"#185FA5" },
  { id:"pro", label:"Pro", price:"59€/mois", color:"#0F6E56" },
  { id:"multi", label:"Multi-sites", price:"149€/mois", color:"#534AB7" },
]

const ST = {
  ok: { color:"#0F6E56", bg:"#E1F5EE", label:"Conforme" },
  warn: { color:"#BA7517", bg:"#FAEEDA", label:"Attention" },
  bad: { color:"#A32D2D", bg:"#FCEBEB", label:"Non conforme" }
}

const tempStatus = (val, eq) => {
  if (eq.type === "froid") {
    if (eq.temp_max && val > eq.temp_max) return "bad"
    if (eq.temp_max && val > eq.temp_max - 1) return "warn"
    return "ok"
  }
  if (eq.type === "chaud") {
    if (eq.temp_min && val < eq.temp_min) return "bad"
    if (eq.temp_min && val < eq.temp_min + 3) return "warn"
    return "ok"
  }
  return "ok"
}

const Tag = ({ children, color = "green" }) => {
  const c = {
    green:{bg:"#E1F5EE",text:"#085041"},
    amber:{bg:"#FAEEDA",text:"#412402"},
    red:{bg:"#FCEBEB",text:"#501313"},
    blue:{bg:"#E6F1FB",text:"#042C53"},
    purple:{bg:"#EEEDFE",text:"#26215C"},
    gray:{bg:"#F1EFE8",text:"#2C2C2A"}
  }[color] || {bg:"#E1F5EE",text:"#085041"}
  return <span style={{fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:20,background:c.bg,color:c.text}}>{children}</span>
}

function PageEquipements({ profile }) {
  const [equipements, setEquipements] = useState([])
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [newEq, setNewEq] = useState({ nom:"", type:"froid", temp_min:"", temp_max:"" })
  const [saisieValues, setSaisieValues] = useState({})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState("")
  const [activeTab, setActiveTab] = useState("equipements")
  const tenantId = profile?.tenant_id

  useEffect(() => {
    if (tenantId) { loadEquipements(); loadLogs() }
  }, [tenantId])

  const loadEquipements = async () => {
    setLoading(true)
    const { data } = await supabase.from("equipements").select("*").eq("tenant_id", tenantId).eq("actif", true).order("created_at")
    setEquipements(data || [])
    setLoading(false)
  }

  const loadLogs = async () => {
    const today = new Date().toISOString().split("T")[0]
    const { data } = await supabase.from("temperature_logs").select("*").eq("tenant_id", tenantId).gte("recorded_at", today).order("recorded_at", { ascending: false })
    setLogs(data || [])
  }

  const ajouterEquipement = async () => {
    if (!newEq.nom) { setMsg("Le nom est obligatoire"); return }
    setSaving(true)
    const { error } = await supabase.from("equipements").insert([{
      tenant_id: tenantId, nom: newEq.nom, type: newEq.type,
      temp_min: newEq.temp_min ? parseFloat(newEq.temp_min) : null,
      temp_max: newEq.temp_max ? parseFloat(newEq.temp_max) : null, actif: true,
    }])
    if (error) setMsg("Erreur : " + error.message)
    else { setMsg("✅ Équipement ajouté !"); setNewEq({ nom:"", type:"froid", temp_min:"", temp_max:"" }); setShowForm(false); loadEquipements() }
    setSaving(false)
    setTimeout(() => setMsg(""), 3000)
  }

  const supprimerEquipement = async (id) => {
    await supabase.from("equipements").update({ actif: false }).eq("id", id)
    loadEquipements()
  }

  const saisirTemperatures = async () => {
    setSaving(true)
    const records = equipements
      .filter(eq => saisieValues[eq.id] !== undefined && saisieValues[eq.id] !== "")
      .map(eq => {
        const val = parseFloat(saisieValues[eq.id])
        const st = tempStatus(val, eq)
        return { tenant_id: tenantId, zone: eq.nom, value: val, type: eq.type, is_compliant: st === "ok", recorded_at: new Date().toISOString() }
      })
    if (records.length === 0) { setMsg("Saisissez au moins une température"); setSaving(false); return }
    const { error } = await supabase.from("temperature_logs").insert(records)
    if (error) setMsg("Erreur : " + error.message)
    else { setMsg("✅ Températures enregistrées !"); setSaisieValues({}); setActiveTab("historique"); loadLogs() }
    setSaving(false)
    setTimeout(() => setMsg(""), 3000)
  }

  const todayStr = new Date().toISOString().split("T")[0]
  const todayLogs = logs.filter(l => new Date(l.recorded_at).toISOString().split("T")[0] === todayStr)
  const alerts = todayLogs.filter(l => !l.is_compliant)

  return (
    <div>
      <div style={{display:"flex",gap:6,marginBottom:16,background:"#F0F0EC",borderRadius:10,padding:4}}>
        {[{id:"equipements",label:"🔧 Équipements"},{id:"saisie",label:"🌡️ Saisie T°"},{id:"historique",label:"📋 Historique"}].map(t =>
          <button key={t.id} onClick={()=>setActiveTab(t.id)} style={{flex:1,padding:"8px 4px",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",background:activeTab===t.id?"#fff":"transparent",color:activeTab===t.id?"#0F6E56":"#888",fontWeight:activeTab===t.id?600:400,fontSize:11}}>
            {t.label}
          </button>
        )}
      </div>

      {msg && <div style={{padding:"10px 14px",background:msg.includes("✅")?"#E1F5EE":"#FCEBEB",color:msg.includes("✅")?"#085041":"#501313",borderRadius:8,marginBottom:12,fontSize:13}}>{msg}</div>}

      {activeTab === "equipements" && (
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:13,color:"#888"}}>{equipements.length} équipement{equipements.length>1?"s":""}</div>
            <button onClick={()=>setShowForm(!showForm)} style={{padding:"8px 16px",background:"#1D9E75",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:600}}>+ Ajouter</button>
          </div>

          {showForm && <div style={{background:"#fff",border:"1px solid #1D9E75",borderRadius:12,padding:16,marginBottom:14}}>
            <div style={{fontSize:13,fontWeight:600,color:"#222",marginBottom:12}}>Nouvel équipement</div>
            <div style={{marginBottom:10}}>
              <label style={{fontSize:11,color:"#666",display:"block",marginBottom:4}}>Nom *</label>
              <input value={newEq.nom} onChange={e=>setNewEq(p=>({...p,nom:e.target.value}))} placeholder="Ex: Frigo cuisine, Congélateur..." style={{width:"100%",padding:"8px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
            </div>
            <div style={{marginBottom:10}}>
              <label style={{fontSize:11,color:"#666",display:"block",marginBottom:4}}>Type</label>
              <select value={newEq.type} onChange={e=>setNewEq(p=>({...p,type:e.target.value}))} style={{width:"100%",padding:"8px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:13,outline:"none",background:"#fff"}}>
                <option value="froid">❄️ Froid (frigo, congélateur, vitrine)</option>
                <option value="chaud">🔥 Chaud (bain-marie, four, plancha)</option>
                <option value="ambiant">🌡️ Ambiant (salle, réserve)</option>
              </select>
            </div>
            {newEq.type === "froid" && <div style={{marginBottom:12}}>
              <label style={{fontSize:11,color:"#666",display:"block",marginBottom:4}}>Température max (°C)</label>
              <input type="number" value={newEq.temp_max} onChange={e=>setNewEq(p=>({...p,temp_max:e.target.value}))} placeholder="Ex: 4" style={{width:"100%",padding:"8px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
            </div>}
            {newEq.type === "chaud" && <div style={{marginBottom:12}}>
              <label style={{fontSize:11,color:"#666",display:"block",marginBottom:4}}>Température min (°C)</label>
              <input type="number" value={newEq.temp_min} onChange={e=>setNewEq(p=>({...p,temp_min:e.target.value}))} placeholder="Ex: 63" style={{width:"100%",padding:"8px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
            </div>}
            <div style={{display:"flex",gap:8}}>
              <button onClick={ajouterEquipement} disabled={saving} style={{padding:"8px 20px",background:"#1D9E75",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:600}}>{saving?"...":"Ajouter"}</button>
              <button onClick={()=>setShowForm(false)} style={{padding:"8px 16px",background:"#fff",color:"#666",border:"1px solid #E0E0DC",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:12}}>Annuler</button>
            </div>
          </div>}

          {loading ? <div style={{color:"#888",fontSize:13,textAlign:"center",padding:20}}>Chargement...</div> :
            equipements.length === 0 ? <div style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,padding:24,textAlign:"center"}}>
              <div style={{fontSize:32,marginBottom:8}}>🔧</div>
              <div style={{fontSize:13,color:"#888",marginBottom:4}}>Aucun équipement configuré</div>
              <div style={{fontSize:11,color:"#aaa"}}>Ajoutez vos frigos, congélateurs, bains-marie...</div>
            </div> :
            <div style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,overflow:"hidden"}}>
              {equipements.map((eq,i) => {
                const lastLog = todayLogs.find(l => l.zone === eq.nom)
                const st = lastLog ? (lastLog.is_compliant ? "ok" : "bad") : null
                return <div key={eq.id} style={{display:"flex",alignItems:"center",gap:12,padding:"13px 16px",borderBottom:i<equipements.length-1?"0.5px solid #F0F0EC":"none"}}>
                  <div style={{width:40,height:40,borderRadius:10,background:eq.type==="froid"?"#E6F1FB":eq.type==="chaud"?"#FCEBEB":"#F1EFE8",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>
                    {eq.type==="froid"?"❄️":eq.type==="chaud"?"🔥":"🌡️"}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:600,color:"#222"}}>{eq.nom}</div>
                    <div style={{fontSize:11,color:"#888"}}>
                      {eq.type==="froid" && eq.temp_max && `Max : ${eq.temp_max}°C`}
                      {eq.type==="chaud" && eq.temp_min && `Min : ${eq.temp_min}°C`}
                      {eq.type==="ambiant" && "Température ambiante"}
                    </div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    {lastLog ? <div style={{textAlign:"center"}}>
                      <div style={{fontSize:16,fontWeight:700,color:ST[st].color}}>{lastLog.value}°C</div>
                      <Tag color={st==="ok"?"green":"red"}>{ST[st].label}</Tag>
                    </div> : <span style={{fontSize:11,color:"#aaa"}}>Non relevé</span>}
                    <button onClick={()=>supprimerEquipement(eq.id)} style={{fontSize:11,padding:"4px 8px",background:"#FCEBEB",color:"#A32D2D",border:"none",borderRadius:6,cursor:"pointer",fontFamily:"inherit"}}>🗑️</button>
                  </div>
                </div>
              })}
            </div>
          }
        </div>
      )}

      {activeTab === "saisie" && (
        <div>
          <div style={{fontSize:13,color:"#888",marginBottom:16,textTransform:"capitalize"}}>
            {new Date().toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"})}
          </div>
          {equipements.length === 0 ? (
            <div style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,padding:24,textAlign:"center"}}>
              <div style={{fontSize:32,marginBottom:8}}>🔧</div>
              <div style={{fontSize:13,color:"#888"}}>Ajoutez d'abord vos équipements</div>
            </div>
          ) : (
            <div>
              <div style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,overflow:"hidden",marginBottom:14}}>
                {equipements.map((eq,i) => {
                  const lastLog = todayLogs.find(l => l.zone === eq.nom)
                  const currentVal = saisieValues[eq.id]
                  const previewSt = currentVal ? tempStatus(parseFloat(currentVal), eq) : null
                  return <div key={eq.id} style={{padding:"14px 16px",borderBottom:i<equipements.length-1?"0.5px solid #F0F0EC":"none"}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:18}}>{eq.type==="froid"?"❄️":eq.type==="chaud"?"🔥":"🌡️"}</span>
                        <div>
                          <div style={{fontSize:13,fontWeight:600,color:"#222"}}>{eq.nom}</div>
                          <div style={{fontSize:11,color:"#888"}}>
                            {eq.type==="froid" && eq.temp_max && `Max : ${eq.temp_max}°C`}
                            {eq.type==="chaud" && eq.temp_min && `Min : ${eq.temp_min}°C`}
                          </div>
                        </div>
                      </div>
                      {lastLog && <Tag color={lastLog.is_compliant?"green":"red"}>{lastLog.value}°C relevé</Tag>}
                    </div>
                    <input
                      type="number" step="0.1"
                      value={saisieValues[eq.id] || ""}
                      onChange={e=>setSaisieValues(p=>({...p,[eq.id]:e.target.value}))}
                      placeholder="Saisir la température en °C"
                      style={{width:"100%",padding:"10px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:14,outline:"none",boxSizing:"border-box"}}
                    />
                    {previewSt && <div style={{marginTop:6,fontSize:12,color:ST[previewSt].color,fontWeight:500}}>
                      {previewSt==="ok"?"✅ Conforme":previewSt==="warn"?"⚠️ Attention — proche de la limite":"🚨 Non conforme — action requise"}
                    </div>}
                  </div>
                })}
              </div>
              <button onClick={saisirTemperatures} disabled={saving} style={{width:"100%",padding:14,background:"#1D9E75",color:"#fff",border:"none",borderRadius:12,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                {saving ? "Enregistrement..." : "💾 Enregistrer les températures"}
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === "historique" && (
        <div>
          <div style={{fontSize:13,color:"#888",marginBottom:16}}>Relevés enregistrés</div>
          {alerts.length > 0 && <div style={{marginBottom:14}}>
            <div style={{fontSize:12,fontWeight:600,color:"#A32D2D",marginBottom:8}}>🚨 Alertes aujourd'hui</div>
            {alerts.map((a,i) => <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:"#FCEBEB",borderLeft:"3px solid #E24B4A",borderRadius:8,marginBottom:6}}>
              <span style={{fontSize:12,color:"#A32D2D",fontWeight:500}}>{a.zone} : {a.value}°C — Non conforme</span>
            </div>)}
          </div>}
          {logs.length === 0 ? (
            <div style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,padding:24,textAlign:"center"}}>
              <div style={{fontSize:32,marginBottom:8}}>📋</div>
              <div style={{fontSize:13,color:"#888"}}>Aucun relevé enregistré</div>
            </div>
          ) : (
            <div style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,overflow:"hidden"}}>
              {logs.slice(0,30).map((log,i) => {
                const d = new Date(log.recorded_at)
                const st = log.is_compliant ? "ok" : "bad"
                return <div key={log.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",borderBottom:i<logs.length-1?"0.5px solid #F0F0EC":"none"}}>
                  <div style={{width:44,height:44,borderRadius:10,background:ST[st].bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:700,color:ST[st].color,flexShrink:0}}>
                    {log.value}°
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:600,color:"#222"}}>{log.zone}</div>
                    <div style={{fontSize:11,color:"#888"}}>{d.toLocaleDateString("fr-FR")} à {d.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}</div>
                  </div>
                  <Tag color={log.is_compliant?"green":"red"}>{log.is_compliant?"Conforme":"⚠️ Alerte"}</Tag>
                </div>
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function PageRapports({ profile }) {
  const [rapports, setRapports] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [msg, setMsg] = useState("")
  const tenantId = profile?.tenant_id

  useEffect(() => { if (tenantId) loadRapports() }, [tenantId])

  const loadRapports = async () => {
    setLoading(true)
    const { data } = await supabase.from("daily_reports").select("*").eq("tenant_id", tenantId).order("report_date", { ascending: false }).limit(10)
    setRapports(data || [])
    setLoading(false)
  }

  const genererRapport = async () => {
    setGenerating(true)
    const today = new Date().toISOString().split("T")[0]
    const { data: logs } = await supabase.from("temperature_logs").select("*").eq("tenant_id", tenantId).gte("recorded_at", today)
    const total = logs?.length || 0
    const conformes = logs?.filter(l => l.is_compliant).length || 0
    const alerts = total - conformes
    const score = total > 0 ? Math.round((conformes / total) * 100) : 0
    const { error } = await supabase.from("daily_reports").upsert([{
      tenant_id: tenantId, report_date: today, score,
      checklist_pct: 0, temp_alerts: alerts,
      summary: `Rapport du ${new Date().toLocaleDateString("fr-FR")} — ${total} relevés, ${conformes} conformes, ${alerts} alertes.`,
    }], { onConflict: "tenant_id,report_date" })
    if (error) setMsg("Erreur : " + error.message)
    else { setMsg("✅ Rapport généré !"); loadRapports() }
    setGenerating(false)
    setTimeout(() => setMsg(""), 3000)
  }

  const scoreColor = (s) => s >= 80 ? "ok" : s >= 60 ? "warn" : "bad"

  return (
    <div>
      <div style={{fontSize:13,color:"#888",marginBottom:16}}>Rapports journaliers</div>
      {msg && <div style={{padding:"10px 14px",background:msg.includes("✅")?"#E1F5EE":"#FCEBEB",color:msg.includes("✅")?"#085041":"#501313",borderRadius:8,marginBottom:12,fontSize:13}}>{msg}</div>}
      <button onClick={genererRapport} disabled={generating} style={{width:"100%",marginBottom:16,padding:14,background:"#1D9E75",color:"#fff",border:"none",borderRadius:12,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
        {generating ? "Génération..." : "📊 Générer le rapport du jour"}
      </button>
      {loading ? <div style={{color:"#888",fontSize:13,textAlign:"center",padding:20}}>Chargement...</div> :
        rapports.length === 0 ? (
          <div style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,padding:24,textAlign:"center"}}>
            <div style={{fontSize:32,marginBottom:8}}>📊</div>
            <div style={{fontSize:13,color:"#888"}}>Aucun rapport généré</div>
            <div style={{fontSize:11,color:"#aaa",marginTop:4}}>Saisissez des températures puis générez le rapport</div>
          </div>
        ) : (
          <div style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,overflow:"hidden"}}>
            {rapports.map((r,i) => {
              const st = scoreColor(r.score || 0)
              return <div key={r.id} style={{padding:"14px 16px",borderBottom:i<rapports.length-1?"0.5px solid #F0F0EC":"none"}}>
                <div style={{display:"flex",alignItems:"center",gap:14}}>
                  <div style={{width:52,height:52,borderRadius:10,background:ST[st].bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:800,color:ST[st].color,flexShrink:0}}>{r.score || 0}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:600,color:"#222"}}>{new Date(r.report_date).toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"})}</div>
                    <div style={{fontSize:11,color:"#888",marginTop:2}}>{r.summary}</div>
                    <div style={{display:"flex",gap:8,marginTop:6}}>
                      {r.temp_alerts > 0 && <Tag color="red">{r.temp_alerts} alerte{r.temp_alerts>1?"s":""}</Tag>}
                      <Tag color={st==="ok"?"green":st==="warn"?"amber":"red"}>Score : {r.score || 0}/100</Tag>
                    </div>
                  </div>
                </div>
              </div>
            })}
          </div>
        )
      }
    </div>
  )
}

function SuperAdmin({ session, onLogout }) {
  const [page, setPage] = useState("dashboard")
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNewClient, setShowNewClient] = useState(false)
  const [newClient, setNewClient] = useState({ name:"", email:"", phone:"", address:"", plan:"trial" })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState("")

  useEffect(() => { loadTenants() }, [])

  const loadTenants = async () => {
    setLoading(true)
    const { data } = await supabase.from("tenants").select("*").order("created_at", { ascending:false })
    setTenants(data || [])
    setLoading(false)
  }

  const createClient = async () => {
    if (!newClient.name || !newClient.email) { setMsg("Nom et email obligatoires"); return }
    setSaving(true)
    const slug = newClient.name.toLowerCase().replace(/\s+/g,"-").replace(/[^a-z0-9-]/g,"") + "-" + Date.now()
    const { error } = await supabase.from("tenants").insert([{ name:newClient.name, email:newClient.email, phone:newClient.phone, address:newClient.address, plan:newClient.plan, slug, is_active:true }])
    if (error) setMsg("Erreur : " + error.message)
    else { setMsg("✅ Client créé !"); setNewClient({name:"",email:"",phone:"",address:"",plan:"trial"}); setShowNewClient(false); loadTenants() }
    setSaving(false)
  }

  const toggleActive = async (id, current) => {
    await supabase.from("tenants").update({ is_active: !current }).eq("id", id)
    loadTenants()
  }

  const planColor = (plan) => ({ trial:"gray", starter:"blue", pro:"green", multi:"purple", enterprise:"purple" }[plan] || "gray")
  const NAV = [{id:"dashboard",label:"📊 Dashboard"},{id:"clients",label:"🏪 Clients"},{id:"stats",label:"📈 Stats"}]

  return (
    <div style={{fontFamily:"'DM Sans','Trebuchet MS',sans-serif",minHeight:"100vh",background:"#FAFAF8"}}>
      <div style={{background:"#1D9E75",padding:"16px 24px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:36,height:36,background:"rgba(255,255,255,0.2)",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🛡️</div>
          <div>
            <div style={{fontSize:16,fontWeight:700,color:"#fff"}}>SnackSafe Admin</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.7)"}}>Super-administrateur</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:12,color:"rgba(255,255,255,0.8)"}}>{session.user.email}</span>
          <button onClick={onLogout} style={{fontSize:11,padding:"6px 14px",background:"rgba(255,255,255,0.15)",color:"#fff",border:"1px solid rgba(255,255,255,0.3)",borderRadius:8,cursor:"pointer",fontFamily:"inherit"}}>Déconnexion</button>
        </div>
      </div>
      <div style={{background:"#fff",borderBottom:"0.5px solid #E8E8E4",display:"flex",padding:"0 24px"}}>
        {NAV.map(n => <button key={n.id} onClick={()=>setPage(n.id)} style={{padding:"14px 20px",border:"none",borderBottom:page===n.id?"2px solid #1D9E75":"2px solid transparent",background:"transparent",cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:page===n.id?600:400,color:page===n.id?"#1D9E75":"#666"}}>{n.label}</button>)}
      </div>
      <div style={{padding:24,maxWidth:1000,margin:"0 auto"}}>
        {page === "dashboard" && (
          <div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16,marginBottom:24}}>
              {[
                {label:"Total clients",val:tenants.length,icon:"🏪",color:"#0F6E56",bg:"#E1F5EE"},
                {label:"Clients actifs",val:tenants.filter(t=>t.is_active).length,icon:"✅",color:"#185FA5",bg:"#E6F1FB"},
                {label:"Abonnés payants",val:tenants.filter(t=>t.plan!=="trial").length,icon:"💳",color:"#534AB7",bg:"#EEEDFE"},
                {label:"En essai gratuit",val:tenants.filter(t=>t.plan==="trial").length,icon:"⏳",color:"#BA7517",bg:"#FAEEDA"},
              ].map((k,i) => <div key={i} style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,padding:"16px 20px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div><div style={{fontSize:11,color:"#888",marginBottom:8}}>{k.label}</div><div style={{fontSize:32,fontWeight:700,color:k.color}}>{k.val}</div></div>
                  <div style={{width:40,height:40,background:k.bg,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>{k.icon}</div>
                </div>
              </div>)}
            </div>
            <div style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,padding:20}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                <div style={{fontSize:14,fontWeight:600,color:"#222"}}>Derniers clients</div>
                <button onClick={()=>setPage("clients")} style={{fontSize:12,color:"#1D9E75",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit"}}>Voir tous →</button>
              </div>
              {tenants.length === 0 ? <div style={{color:"#888",fontSize:13,textAlign:"center",padding:20}}>Aucun client</div> :
                tenants.slice(0,5).map(t => <div key={t.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:"0.5px solid #F0F0EC"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:34,height:34,background:"#E1F5EE",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>🏪</div>
                    <div><div style={{fontSize:13,fontWeight:600,color:"#222"}}>{t.name}</div><div style={{fontSize:11,color:"#888"}}>{t.email}</div></div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <Tag color={planColor(t.plan)}>{t.plan}</Tag>
                    <div style={{width:8,height:8,borderRadius:"50%",background:t.is_active?"#1D9E75":"#E24B4A"}}/>
                  </div>
                </div>)
              }
            </div>
          </div>
        )}
        {page === "clients" && (
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <div style={{fontSize:16,fontWeight:700,color:"#222"}}>Clients ({tenants.length})</div>
              <button onClick={()=>setShowNewClient(true)} style={{padding:"10px 20px",background:"#1D9E75",color:"#fff",border:"none",borderRadius:10,cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:600}}>+ Nouveau client</button>
            </div>
            {msg && <div style={{padding:"10px 16px",background:msg.includes("✅")?"#E1F5EE":"#FCEBEB",color:msg.includes("✅")?"#085041":"#501313",borderRadius:8,marginBottom:16,fontSize:13}}>{msg}</div>}
            {showNewClient && <div style={{background:"#fff",border:"1px solid #1D9E75",borderRadius:12,padding:20,marginBottom:20}}>
              <div style={{fontSize:14,fontWeight:600,color:"#222",marginBottom:16}}>Nouveau client</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                {[{key:"name",label:"Nom *",ph:"Snack El Baraka"},{key:"email",label:"Email *",ph:"contact@restaurant.com"},{key:"phone",label:"Téléphone",ph:"+33 6 XX XX XX XX"},{key:"address",label:"Adresse",ph:"123 rue de la Paix"}].map(f =>
                  <div key={f.key}>
                    <label style={{fontSize:11,color:"#666",display:"block",marginBottom:4}}>{f.label}</label>
                    <input value={newClient[f.key]} onChange={e=>setNewClient(p=>({...p,[f.key]:e.target.value}))} placeholder={f.ph} style={{width:"100%",padding:"8px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
                  </div>
                )}
              </div>
              <div style={{marginBottom:16}}>
                <label style={{fontSize:11,color:"#666",display:"block",marginBottom:4}}>Plan</label>
                <select value={newClient.plan} onChange={e=>setNewClient(p=>({...p,plan:e.target.value}))} style={{width:"100%",padding:"8px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:13,outline:"none",background:"#fff"}}>
                  {PLANS.map(p => <option key={p.id} value={p.id}>{p.label} — {p.price}</option>)}
                </select>
              </div>
              <div style={{display:"flex",gap:10}}>
                <button onClick={createClient} disabled={saving} style={{padding:"10px 24px",background:"#1D9E75",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:600}}>{saving?"Création...":"Créer"}</button>
                <button onClick={()=>{setShowNewClient(false);setMsg("")}} style={{padding:"10px 24px",background:"#fff",color:"#666",border:"1px solid #E0E0DC",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:13}}>Annuler</button>
              </div>
            </div>}
            <div style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,overflow:"hidden"}}>
              <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 100px",padding:"12px 20px",background:"#F5F5F2",fontSize:11,fontWeight:600,color:"#888",textTransform:"uppercase"}}>
                <div>Restaurant</div><div>Plan</div><div>Statut</div><div>Créé le</div><div>Action</div>
              </div>
              {tenants.map((t,i) => <div key={t.id} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 100px",padding:"14px 20px",borderTop:i>0?"0.5px solid #F0F0EC":"none",alignItems:"center"}}>
                <div><div style={{fontSize:13,fontWeight:600,color:"#222"}}>{t.name}</div><div style={{fontSize:11,color:"#888"}}>{t.email}</div></div>
                <div><Tag color={planColor(t.plan)}>{t.plan}</Tag></div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:t.is_active?"#1D9E75":"#E24B4A"}}/>
                  <span style={{fontSize:12,color:t.is_active?"#0F6E56":"#A32D2D"}}>{t.is_active?"Actif":"Inactif"}</span>
                </div>
                <div style={{fontSize:12,color:"#888"}}>{new Date(t.created_at).toLocaleDateString("fr-FR")}</div>
                <button onClick={()=>toggleActive(t.id,t.is_active)} style={{fontSize:11,padding:"4px 10px",background:t.is_active?"#FCEBEB":"#E1F5EE",color:t.is_active?"#A32D2D":"#0F6E56",border:"none",borderRadius:6,cursor:"pointer",fontFamily:"inherit"}}>{t.is_active?"Désactiver":"Activer"}</button>
              </div>)}
            </div>
          </div>
        )}
        {page === "stats" && (
          <div>
            <div style={{fontSize:16,fontWeight:700,color:"#222",marginBottom:20}}>Statistiques</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16}}>
              {[
                {label:"Revenus mensuels",val:`${tenants.filter(t=>t.plan==="starter").length*29+tenants.filter(t=>t.plan==="pro").length*59+tenants.filter(t=>t.plan==="multi").length*149}€`,icon:"💰",color:"#0F6E56"},
                {label:"Taux de conversion",val:tenants.length?`${Math.round((tenants.filter(t=>t.plan!=="trial").length/tenants.length)*100)}%`:"0%",icon:"📈",color:"#185FA5"},
                {label:"Nouveaux cette semaine",val:tenants.filter(t=>new Date(t.created_at)>new Date(Date.now()-7*24*60*60*1000)).length,icon:"🆕",color:"#534AB7"},
              ].map((k,i) => <div key={i} style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,padding:20}}>
                <div style={{fontSize:28,marginBottom:8}}>{k.icon}</div>
                <div style={{fontSize:11,color:"#888",marginBottom:6}}>{k.label}</div>
                <div style={{fontSize:28,fontWeight:700,color:k.color}}>{k.val}</div>
              </div>)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ClientApp({ session, profile, onLogout }) {
  const [page, setPage] = useState("dashboard")
  const NAV = [
  {id:"dashboard",icon:"🏠",label:"Accueil"},
  {id:"equipements",icon:"🌡️",label:"Temp."},
  {id:"checklist",icon:"✅",label:"Checklist"},
  {id:"rapports",icon:"📊",label:"Rapports"},
  {id:"reception",icon:"📦",label:"Réception"},
  {id:"maintien",icon:"🔥",label:"Chaud"},
]
  return (
    <div style={{fontFamily:"'DM Sans','Trebuchet MS',sans-serif",maxWidth:460,margin:"0 auto",background:"#FAFAF8",minHeight:"100vh",display:"flex",flexDirection:"column"}}>
      <div style={{background:"#fff",borderBottom:"0.5px solid #E8E8E4",padding:"14px 20px 12px",position:"sticky",top:0,zIndex:10}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:34,height:34,background:"#1D9E75",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🛡️</div>
            <div>
              <div style={{fontSize:16,fontWeight:700,color:"#1a1a1a"}}>SnackSafe</div>
              <div style={{fontSize:10,color:"#888"}}>HACCP · Hygiène · Réglementation</div>
            </div>
          </div>
          <button onClick={onLogout} style={{fontSize:11,padding:"5px 12px",background:"#fff",border:"1px solid #E0E0DC",borderRadius:8,cursor:"pointer",fontFamily:"inherit",color:"#666"}}>Déconnexion</button>
        </div>
      </div>
      <div style={{flex:1,padding:"16px 16px 80px",overflow:"auto"}}>
        {page==="dashboard" && <PageDashboard setPage={setPage} profile={profile}/>}
        {page==="equipements" && <PageEquipements profile={profile}/>}
        {page==="checklist" && <PageChecklist profile={profile}/>}
        {page==="reglementation" && <PageReglementation/>}
        {page==="rapports" && <PageRapports profile={profile}/>}
        {page==="reception" && <PageReception profile={profile}/>}
        {page==="maintien" && <PageMaintienChaud profile={profile}/>}
      </div>
      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:460,background:"#fff",borderTop:"0.5px solid #E8E8E4",display:"flex",padding:"4px 8px 8px",zIndex:10}}>
        {NAV.map(n => <button key={n.id} onClick={()=>setPage(n.id)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"8px 2px",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",background:page===n.id?"#E1F5EE":"transparent"}}>
          <span style={{fontSize:18}}>{n.icon}</span>
          <span style={{fontSize:9,color:page===n.id?"#0F6E56":"#888",fontWeight:page===n.id?600:400}}>{n.label}</span>
        </button>)}
      </div>
    </div>
  )
}

function PageDashboard({ setPage, profile }) {
  const [todayAlerts, setTodayAlerts] = useState([])
  const tenantId = profile?.tenant_id

  useEffect(() => {
    if (tenantId) {
      const today = new Date().toISOString().split("T")[0]
      supabase.from("temperature_logs").select("*").eq("tenant_id", tenantId).eq("is_compliant", false).gte("recorded_at", today)
        .then(({ data }) => setTodayAlerts(data || []))
    }
  }, [tenantId])

  const today = new Date().toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"})
  return (
    <div>
      <div style={{fontSize:12,color:"#888",marginBottom:16,textTransform:"capitalize"}}>{today}</div>
      {todayAlerts.length > 0 && <div style={{marginBottom:16}}>
        {todayAlerts.map((a,i) => <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:"#FCEBEB",borderLeft:"3px solid #E24B4A",borderRadius:8,marginBottom:6}}>
          <span style={{fontSize:14}}>🚨</span>
          <span style={{fontSize:12,color:"#A32D2D",fontWeight:500}}>{a.zone} : {a.value}°C — Non conforme</span>
        </div>)}
      </div>}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
        {[
          {label:"Alertes aujourd'hui",val:todayAlerts.length,sub:"températures non conformes",color:todayAlerts.length>0?"#A32D2D":"#0F6E56"},
          {label:"CCP conformes",val:`${HACCP_POINTS.filter(h=>h.status==="ok").length}/${HACCP_POINTS.length}`,sub:"Points critiques",color:"#0F6E56"},
          {label:"Dernière inspection",val:"OK",sub:"Il y a 12 jours",color:"#185FA5"},
          {label:"Formation requise",val:"Non",sub:"Tous formés",color:"#0F6E56"},
        ].map((k,i) => <div key={i} style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,padding:"14px 16px"}}>
          <div style={{fontSize:11,color:"#888",marginBottom:6}}>{k.label}</div>
          <div style={{fontSize:22,fontWeight:700,color:k.color}}>{k.val}</div>
          <div style={{fontSize:11,color:"#aaa",marginTop:2}}>{k.sub}</div>
        </div>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {[
          {label:"Saisir températures",icon:"🌡️",page:"equipements",bg:"#E6F1FB",color:"#042C53"},
          {label:"Checklist",icon:"✅",page:"checklist",bg:"#E1F5EE",color:"#085041"},
          {label:"Réglementation",icon:"📋",page:"reglementation",bg:"#EEEDFE",color:"#26215C"},
          {label:"Rapports",icon:"📊",page:"rapports",bg:"#FAEEDA",color:"#412402"},
        ].map((q,i) => <button key={i} onClick={()=>setPage(q.page)} style={{background:q.bg,border:"none",borderRadius:10,padding:"14px 16px",textAlign:"left",cursor:"pointer",fontFamily:"inherit"}}>
          <div style={{fontSize:20,marginBottom:6}}>{q.icon}</div>
          <div style={{fontSize:12,fontWeight:600,color:q.color}}>{q.label}</div>
        </button>)}
      </div>
    </div>
  )
}

function PageHACCP() {
  const [open, setOpen] = useState(null)
  return <div>
    <div style={{fontSize:13,color:"#888",marginBottom:16}}>7 Points Critiques de Contrôle</div>
    {HACCP_POINTS.map(h => { const st=h.status; const isOpen=open===h.id; return (
      <div key={h.id} style={{background:"#fff",border:`0.5px solid ${isOpen?ST[st].color:"#E8E8E4"}`,borderRadius:12,marginBottom:10,overflow:"hidden"}}>
        <div onClick={()=>setOpen(isOpen?null:h.id)} style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",cursor:"pointer"}}>
          <div style={{width:40,height:40,borderRadius:10,background:ST[st].bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:ST[st].color,flexShrink:0}}>{h.id}</div>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:600,color:"#222",marginBottom:4}}>{h.label}</div>
            <div style={{display:"flex",gap:6}}><Tag color={st==="ok"?"green":st==="warn"?"amber":"red"}>{ST[st].label}</Tag><span style={{fontSize:11,color:"#aaa"}}>{h.category}</span></div>
          </div>
          <span style={{color:"#aaa",fontSize:16,transform:isOpen?"rotate(90deg)":"none",transition:"transform 0.2s"}}>›</span>
        </div>
        {isOpen && <div style={{padding:"0 16px 16px",borderTop:"0.5px solid #F0F0EC"}}>
          <div style={{background:ST[st].bg,borderRadius:8,padding:"10px 12px",margin:"12px 0"}}>
            <div style={{fontSize:10,fontWeight:700,color:ST[st].color,marginBottom:3,textTransform:"uppercase"}}>Limite critique</div>
            <div style={{fontSize:13,color:ST[st].color,fontWeight:600}}>{h.limit}</div>
          </div>
          {h.actions.map((a,i) => <div key={i} style={{display:"flex",gap:8,marginBottom:6}}>
            <div style={{width:5,height:5,borderRadius:"50%",background:"#1D9E75",marginTop:5,flexShrink:0}}/>
            <span style={{fontSize:12,color:"#444"}}>{a}</span>
          </div>)}
          <div style={{display:"flex",gap:8,alignItems:"center",marginTop:12,padding:"8px 12px",background:"#F5F5F2",borderRadius:8}}>
            <span style={{fontSize:12}}>🔄</span><span style={{fontSize:12,color:"#666"}}>Fréquence : <strong>{h.freq}</strong></span>
          </div>
        </div>}
      </div>
    )})}
  </div>
}

function PageChecklist({ profile }) {
  const [tab, setTab] = useState("ouverture")
  const [checked, setChecked] = useState({})
  const [loading, setLoading] = useState(true)
  const tenantId = profile?.tenant_id
  const today = new Date().toISOString().split("T")[0]

  useEffect(() => {
    if (tenantId) loadChecklist()
  }, [tenantId])

  const loadChecklist = async () => {
    setLoading(true)
    const { data } = await supabase
      .from("checklist_logs")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("date", today)
    if (data) {
      const map = {}
      data.forEach(row => { map[row.item_id] = row.is_checked })
      setChecked(map)
    }
    setLoading(false)
  }

  const toggle = async (id) => {
    const newVal = !checked[id]
    setChecked(p => ({ ...p, [id]: newVal }))
    await supabase.from("checklist_logs").upsert([{
      tenant_id: tenantId,
      date: today,
      item_id: id,
    is_checked: newVal,
    }], { onConflict: "tenant_id,date,item_id" })
  }

  const items = CHECKLIST_ITEMS[tab]
  const done = items.filter(i => checked[i.id]).length
  const pct = Math.round((done / items.length) * 100)

  if (loading) return <div style={{color:"#888",fontSize:13,textAlign:"center",padding:40}}>Chargement...</div>

  return <div>
    <div style={{display:"flex",gap:6,marginBottom:16,background:"#F0F0EC",borderRadius:10,padding:4}}>
      {["ouverture","service","fermeture"].map(t => {
        const d = CHECKLIST_ITEMS[t].filter(i => checked[i.id]).length
        return <button key={t} onClick={() => setTab(t)} style={{flex:1,padding:"8px 6px",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",background:tab===t?"#fff":"transparent",color:tab===t?"#0F6E56":"#888",fontWeight:tab===t?600:400,fontSize:11}}>
          {t.charAt(0).toUpperCase()+t.slice(1)}<br/><span style={{fontSize:10,color:"#aaa"}}>{d}/{CHECKLIST_ITEMS[t].length}</span>
        </button>
      })}
    </div>
    <div style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,padding:"14px 16px",marginBottom:16}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
        <span style={{fontSize:12,color:"#666"}}>{done} / {items.length} tâches</span>
        <span style={{fontSize:12,fontWeight:700,color:"#1D9E75"}}>{pct}%</span>
      </div>
      <div style={{height:6,background:"#F0F0EC",borderRadius:3}}>
        <div style={{height:"100%",background:"#1D9E75",borderRadius:3,width:`${pct}%`,transition:"width 0.3s"}}/>
      </div>
    </div>
    <div style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,overflow:"hidden"}}>
      {items.map((item,idx) => <div key={item.id} onClick={()=>toggle(item.id)} style={{display:"flex",alignItems:"center",gap:12,padding:"13px 16px",borderBottom:idx<items.length-1?"0.5px solid #F0F0EC":"none",cursor:"pointer",background:checked[item.id]?"#FAFAF8":"#fff"}}>
        <div style={{width:22,height:22,borderRadius:6,flexShrink:0,border:checked[item.id]?"none":"1.5px solid #DDD",background:checked[item.id]?"#1D9E75":"transparent",display:"flex",alignItems:"center",justifyContent:"center"}}>
          {checked[item.id] && <span style={{color:"#fff",fontSize:13}}>✓</span>}
        </div>
        <span style={{flex:1,fontSize:13,color:checked[item.id]?"#aaa":"#222",textDecoration:checked[item.id]?"line-through":"none"}}>{item.label}</span>
        {item.ccp && <Tag color={checked[item.id]?"green":"red"}>CCP</Tag>}
      </div>)}
    </div>
  </div>
}
function PageReception({ profile }) {
  const [receptions, setReceptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState("")
  const tenantId = profile?.tenant_id
  const [form, setForm] = useState({
    fournisseur: "", produit: "", temperature: "",
    dlc: "", aspect_visuel: "conforme",
    etiquetage_conforme: true, stockage_separe: true,
    statut: "accepte", commentaire: ""
  })

  useEffect(() => { if (tenantId) loadReceptions() }, [tenantId])

  const loadReceptions = async () => {
    setLoading(true)
    const { data } = await supabase.from("receptions").select("*")
      .eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(20)
    setReceptions(data || [])
    setLoading(false)
  }

  const handleSubmit = async () => {
    if (!form.fournisseur || !form.produit) { setMsg("Fournisseur et produit obligatoires"); return }
    setSaving(true)
    const temp = form.temperature ? parseFloat(form.temperature) : null
    const temp_conforme = temp !== null ? temp <= 4 : null
    const dlc_conforme = form.dlc ? new Date(form.dlc) >= new Date() : null
    const { error } = await supabase.from("receptions").insert([{
      tenant_id: tenantId,
      fournisseur: form.fournisseur,
      produit: form.produit,
      temperature: temp,
      temperature_conforme: temp_conforme,
      dlc: form.dlc || null,
      dlc_conforme,
      aspect_visuel: form.aspect_visuel,
      etiquetage_conforme: form.etiquetage_conforme,
      stockage_separe: form.stockage_separe,
      statut: form.statut,
      commentaire: form.commentaire,
    }])
    if (error) setMsg("Erreur : " + error.message)
    else {
      setMsg("✅ Fiche enregistrée !")
      setForm({ fournisseur:"", produit:"", temperature:"", dlc:"", aspect_visuel:"conforme", etiquetage_conforme:true, stockage_separe:true, statut:"accepte", commentaire:"" })
      setShowForm(false)
      loadReceptions()
    }
    setSaving(false)
    setTimeout(() => setMsg(""), 3000)
  }

  return <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
      <div style={{fontSize:13,color:"#888"}}>{receptions.length} fiche(s)</div>
      <button onClick={()=>setShowForm(!showForm)} style={{padding:"8px 16px",background:"#1D9E75",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:600}}>+ Nouvelle fiche</button>
    </div>

    {msg && <div style={{padding:"10px 14px",background:msg.includes("✅")?"#E1F5EE":"#FCEBEB",color:msg.includes("✅")?"#085041":"#501313",borderRadius:8,marginBottom:12,fontSize:13}}>{msg}</div>}

    {showForm && <div style={{background:"#fff",border:"1px solid #1D9E75",borderRadius:12,padding:16,marginBottom:16}}>
      <div style={{fontSize:13,fontWeight:700,color:"#222",marginBottom:14}}>📦 Nouvelle réception</div>

      {[["Fournisseur *","fournisseur","text"],["Produit *","produit","text"],["Température (°C)","temperature","number"],["DLC / DDM","dlc","date"]].map(([label,key,type]) =>
        <div key={key} style={{marginBottom:10}}>
          <label style={{fontSize:11,color:"#666",display:"block",marginBottom:4}}>{label}</label>
          <input type={type} value={form[key]} onChange={e=>setForm(p=>({...p,[key]:e.target.value}))}
            style={{width:"100%",padding:"8px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
        </div>
      )}

      <div style={{marginBottom:10}}>
        <label style={{fontSize:11,color:"#666",display:"block",marginBottom:4}}>Aspect visuel</label>
        <select value={form.aspect_visuel} onChange={e=>setForm(p=>({...p,aspect_visuel:e.target.value}))}
          style={{width:"100%",padding:"8px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:13,outline:"none",background:"#fff"}}>
          <option value="conforme">✅ Conforme</option>
          <option value="non_conforme">❌ Non conforme</option>
          <option value="acceptable">⚠️ Acceptable</option>
        </select>
      </div>

      {[["etiquetage_conforme","🏷️ Étiquetage conforme"],["stockage_separe","📦 Stockage cru/cuit séparé"]].map(([key,label]) =>
        <div key={key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"0.5px solid #F0F0EC"}}>
          <span style={{fontSize:13,color:"#222"}}>{label}</span>
          <button onClick={()=>setForm(p=>({...p,[key]:!p[key]}))}
            style={{padding:"4px 14px",borderRadius:20,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:600,background:form[key]?"#1D9E75":"#E0E0DC",color:form[key]?"#fff":"#666"}}>
            {form[key]?"Oui":"Non"}
          </button>
        </div>
      )}

      <div style={{marginTop:12,marginBottom:10}}>
        <label style={{fontSize:11,color:"#666",display:"block",marginBottom:4}}>Statut final</label>
        <select value={form.statut} onChange={e=>setForm(p=>({...p,statut:e.target.value}))}
          style={{width:"100%",padding:"8px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:13,outline:"none",background:"#fff"}}>
          <option value="accepte">✅ Accepté</option>
          <option value="refuse">❌ Refusé</option>
          <option value="reserve">⚠️ Accepté avec réserve</option>
        </select>
      </div>

      <div style={{marginBottom:14}}>
        <label style={{fontSize:11,color:"#666",display:"block",marginBottom:4}}>Commentaire</label>
        <textarea value={form.commentaire} onChange={e=>setForm(p=>({...p,commentaire:e.target.value}))} rows={2}
          style={{width:"100%",padding:"8px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}/>
      </div>

      <div style={{display:"flex",gap:8}}>
        <button onClick={handleSubmit} disabled={saving} style={{padding:"8px 20px",background:"#1D9E75",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:600}}>{saving?"...":"Enregistrer"}</button>
        <button onClick={()=>setShowForm(false)} style={{padding:"8px 16px",background:"#fff",color:"#666",border:"1px solid #E0E0DC",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:12}}>Annuler</button>
      </div>
    </div>}

    {loading ? <div style={{color:"#888",fontSize:13,textAlign:"center",padding:20}}>Chargement...</div> :
      receptions.length === 0 ? <div style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,padding:24,textAlign:"center"}}>
        <div style={{fontSize:32,marginBottom:8}}>📦</div>
        <div style={{fontSize:13,color:"#888"}}>Aucune réception enregistrée</div>
      </div> :
      <div style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,overflow:"hidden"}}>
        {receptions.map((r,i) => <div key={r.id} style={{padding:"13px 16px",borderBottom:i<receptions.length-1?"0.5px solid #F0F0EC":"none"}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
            <span style={{fontSize:13,fontWeight:600,color:"#222"}}>{r.produit}</span>
            <Tag color={r.statut==="accepte"?"green":r.statut==="refuse"?"red":"amber"}>
              {r.statut==="accepte"?"✅ Accepté":r.statut==="refuse"?"❌ Refusé":"⚠️ Réserve"}
            </Tag>
          </div>
          <div style={{fontSize:11,color:"#888"}}>{r.fournisseur} · {new Date(r.date).toLocaleDateString("fr-FR")}</div>
          {r.temperature && <div style={{fontSize:11,color:r.temperature_conforme?"#0F6E56":"#A32D2D",marginTop:2}}>🌡️ {r.temperature}°C {r.temperature_conforme?"✓":"⚠️"}</div>}
        </div>)}
      </div>
    }
  </div>
  function PageMaintienChaud({ profile }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState("")
  const tenantId = profile?.tenant_id
  const [form, setForm] = useState({
    plat: "", heure_debut: "", temperature: "", action_corrective: ""
  })

  useEffect(() => { if (tenantId) loadLogs() }, [tenantId])

  const loadLogs = async () => {
    setLoading(true)
    const { data } = await supabase.from("maintien_chaud").select("*")
      .eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(20)
    setLogs(data || [])
    setLoading(false)
  }

  const handleSubmit = async () => {
    if (!form.plat || !form.heure_debut || !form.temperature) {
      setMsg("Plat, heure et température obligatoires"); return
    }
    setSaving(true)
    const temp = parseFloat(form.temperature)
    const temp_conforme = temp >= 63
    const statut = temp_conforme ? "conforme" : "non_conforme"
    const { error } = await supabase.from("maintien_chaud").insert([{
      tenant_id: tenantId,
      plat: form.plat,
      heure_debut: form.heure_debut,
      temperature: temp,
      temperature_conforme: temp_conforme,
      action_corrective: temp_conforme ? null : form.action_corrective,
      statut,
    }])
    if (error) setMsg("Erreur : " + error.message)
    else {
      setMsg("✅ Relevé enregistré !")
      setForm({ plat: "", heure_debut: "", temperature: "", action_corrective: "" })
      setShowForm(false)
      loadLogs()
    }
    setSaving(false)
    setTimeout(() => setMsg(""), 3000)
  }

  const temp = parseFloat(form.temperature)
  const previewStatut = form.temperature ? (temp >= 63 ? "ok" : "bad") : null

  return <div>
    <div style={{background:"#E6F1FB",borderRadius:12,padding:"12px 16px",marginBottom:16,fontSize:12,color:"#042C53"}}>
      🌡️ <strong>Règle HACCP</strong> — Maintien en température chaude : <strong>≥ 63°C en permanence</strong>
    </div>

    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
      <div style={{fontSize:13,color:"#888"}}>{logs.length} relevé(s)</div>
      <button onClick={()=>setShowForm(!showForm)} style={{padding:"8px 16px",background:"#1D9E75",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:600}}>+ Nouveau relevé</button>
    </div>

    {msg && <div style={{padding:"10px 14px",background:msg.includes("✅")?"#E1F5EE":"#FCEBEB",color:msg.includes("✅")?"#085041":"#501313",borderRadius:8,marginBottom:12,fontSize:13}}>{msg}</div>}

    {showForm && <div style={{background:"#fff",border:"1px solid #1D9E75",borderRadius:12,padding:16,marginBottom:16}}>
      <div style={{fontSize:13,fontWeight:700,color:"#222",marginBottom:14}}>🔥 Nouveau relevé maintien chaud</div>

      <div style={{marginBottom:10}}>
        <label style={{fontSize:11,color:"#666",display:"block",marginBottom:4}}>Plat / Préparation *</label>
        <input value={form.plat} onChange={e=>setForm(p=>({...p,plat:e.target.value}))}
          placeholder="Ex: Poulet rôti, sauce tomate..."
          style={{width:"100%",padding:"8px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
      </div>

      <div style={{marginBottom:10}}>
        <label style={{fontSize:11,color:"#666",display:"block",marginBottom:4}}>Heure du relevé *</label>
        <input type="time" value={form.heure_debut} onChange={e=>setForm(p=>({...p,heure_debut:e.target.value}))}
          style={{width:"100%",padding:"8px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
      </div>

      <div style={{marginBottom:10}}>
        <label style={{fontSize:11,color:"#666",display:"block",marginBottom:4}}>Température relevée (°C) *</label>
        <input type="number" step="0.1" value={form.temperature} onChange={e=>setForm(p=>({...p,temperature:e.target.value}))}
          placeholder="Ex: 68"
          style={{width:"100%",padding:"8px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
        {previewStatut && <div style={{marginTop:6,fontSize:12,fontWeight:500,color:previewStatut==="ok"?"#0F6E56":"#A32D2D"}}>
          {previewStatut==="ok" ? "✅ Conforme (≥ 63°C)" : "🚨 Non conforme — action requise !"}
        </div>}
      </div>

      {previewStatut === "bad" && <div style={{marginBottom:10}}>
        <label style={{fontSize:11,color:"#666",display:"block",marginBottom:4}}>Action corrective *</label>
        <input value={form.action_corrective} onChange={e=>setForm(p=>({...p,action_corrective:e.target.value}))}
          placeholder="Ex: Remise en chauffe, élimination du plat..."
          style={{width:"100%",padding:"8px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
      </div>}

      <div style={{display:"flex",gap:8,marginTop:4}}>
        <button onClick={handleSubmit} disabled={saving} style={{padding:"8px 20px",background:"#1D9E75",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:600}}>{saving?"...":"Enregistrer"}</button>
        <button onClick={()=>setShowForm(false)} style={{padding:"8px 16px",background:"#fff",color:"#666",border:"1px solid #E0E0DC",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:12}}>Annuler</button>
      </div>
    </div>}

    {loading ? <div style={{color:"#888",fontSize:13,textAlign:"center",padding:20}}>Chargement...</div> :
      logs.length === 0 ? <div style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,padding:24,textAlign:"center"}}>
        <div style={{fontSize:32,marginBottom:8}}>🔥</div>
        <div style={{fontSize:13,color:"#888"}}>Aucun relevé enregistré</div>
      </div> :
      <div style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,overflow:"hidden"}}>
        {logs.map((l,i) => <div key={l.id} style={{padding:"13px 16px",borderBottom:i<logs.length-1?"0.5px solid #F0F0EC":"none"}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
            <span style={{fontSize:13,fontWeight:600,color:"#222"}}>{l.plat}</span>
            <Tag color={l.statut==="conforme"?"green":"red"}>
              {l.temperature}°C {l.temperature_conforme?"✓":"⚠️"}
            </Tag>
          </div>
          <div style={{fontSize:11,color:"#888"}}>{new Date(l.date).toLocaleDateString("fr-FR")} à {l.heure_debut?.slice(0,5)}</div>
          {l.action_corrective && <div style={{fontSize:11,color:"#A32D2D",marginTop:4}}>⚠️ {l.action_corrective}</div>}
        </div>)}
      </div>
    }
  </div>
}
function PageReglementation() {
  const [cat, setCat] = useState("Tous")
  const cats = ["Tous",...Array.from(new Set(REGLEMENTS.map(r=>r.categorie)))]
  const filtered = cat==="Tous"?REGLEMENTS:REGLEMENTS.filter(r=>r.categorie===cat)
  return <div>
    <div style={{fontSize:13,fontWeight:700,color:"#222",marginBottom:4}}>14 Allergènes majeurs</div>
    <div style={{fontSize:11,color:"#888",marginBottom:12}}>Obligation d'affichage — Règl. UE 1169/2011</div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginBottom:20}}>
      {ALLERGENS.map(a => <div key={a.id} style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:10,padding:"10px 12px",display:"flex",gap:10,alignItems:"center"}}>
        <span style={{fontSize:20}}>{a.icon}</span>
        <div><div style={{fontSize:12,fontWeight:600,color:"#222"}}>{a.name}</div><div style={{fontSize:10,color:"#aaa"}}>{a.examples}</div></div>
      </div>)}
    </div>
    <div style={{fontSize:13,fontWeight:700,color:"#222",marginBottom:12}}>Textes réglementaires</div>
    <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
      {cats.map(c => <button key={c} onClick={()=>setCat(c)} style={{padding:"5px 12px",borderRadius:20,border:"0.5px solid",fontFamily:"inherit",fontSize:11,cursor:"pointer",background:cat===c?"#1D9E75":"#fff",color:cat===c?"#fff":"#666",borderColor:cat===c?"#1D9E75":"#DDD"}}>{c}</button>)}
    </div>
    {filtered.map(r => <div key={r.id} style={{background:"#fff",border:"0.5px solid #E8E8E4",borderRadius:12,padding:"14px 16px",marginBottom:10}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
        <div style={{fontSize:13,fontWeight:700,color:"#222",flex:1,paddingRight:8}}>{r.titre}</div>
        <Tag color={r.priorite==="haute"?"red":"amber"}>{r.priorite==="haute"?"Prioritaire":"Important"}</Tag>
      </div>
      <div style={{fontSize:11,color:"#1D9E75",fontWeight:600,marginBottom:6}}>{r.ref} · {r.categorie}</div>
      <div style={{fontSize:12,color:"#555",lineHeight:1.6}}>{r.desc}</div>
    </div>)}
  </div>
}

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault(); setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#F5F5F2",fontFamily:"sans-serif"}}>
      <div style={{background:"#fff",borderRadius:16,padding:"40px 36px",width:360,boxShadow:"0 4px 24px rgba(0,0,0,0.08)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:28}}>
          <div style={{width:38,height:38,background:"#1D9E75",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>🛡️</div>
          <div>
            <div style={{fontSize:18,fontWeight:700,color:"#1a1a1a"}}>SnackSafe</div>
            <div style={{fontSize:11,color:"#888"}}>HACCP · Hygiène · Réglementation</div>
          </div>
        </div>
        {error && <div style={{background:"#FCEBEB",color:"#A32D2D",padding:"10px 14px",borderRadius:8,marginBottom:16,fontSize:13}}>{error}</div>}
        <form onSubmit={handleLogin}>
          <div style={{marginBottom:14}}>
            <label style={{fontSize:12,color:"#666",display:"block",marginBottom:5}}>Email</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="votre@email.com" required style={{width:"100%",padding:"10px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:14,outline:"none",boxSizing:"border-box"}}/>
          </div>
          <div style={{marginBottom:20}}>
            <label style={{fontSize:12,color:"#666",display:"block",marginBottom:5}}>Mot de passe</label>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required style={{width:"100%",padding:"10px 12px",border:"1px solid #E0E0DC",borderRadius:8,fontSize:14,outline:"none",boxSizing:"border-box"}}/>
          </div>
          <button type="submit" disabled={loading} style={{width:"100%",padding:12,background:"#1D9E75",color:"#fff",border:"none",borderRadius:8,fontSize:14,fontWeight:600,cursor:"pointer"}}>
            {loading?"Connexion...":"Se connecter"}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) loadProfile(session.user.id)
      else setLoading(false)
    })
    supabase.auth.onAuthStateChange((_, session) => {
      setSession(session)
      if (session) loadProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })
  }, [])

  const loadProfile = async (userId) => {
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).single()
    setProfile(data)
    setLoading(false)
  }

  const handleLogout = () => supabase.auth.signOut()

  if (loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",fontFamily:"sans-serif"}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:32,marginBottom:12}}>🛡️</div>
        <div style={{fontSize:14,color:"#888"}}>Chargement SnackSafe...</div>
      </div>
    </div>
  )

  if (!session) return <Login />
  if (profile?.role === "super_admin") return <SuperAdmin session={session} onLogout={handleLogout} />
  return <ClientApp session={session} profile={profile} onLogout={handleLogout} />
}
