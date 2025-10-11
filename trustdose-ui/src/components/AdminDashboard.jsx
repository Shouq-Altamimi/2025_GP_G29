import React, { useEffect, useMemo, useState } from 'react'
import {
  Users, Activity, Settings, TrendingUp, Shield, FileText, AlertCircle, Plus, Search, Sun, Moon, Bell,
  ChevronDown, Download, Filter, Building2, Stethoscope, Truck, Thermometer, ClipboardList, ChevronRight
} from 'lucide-react'

// ========== small utils ==========
function cx(...classes) { return classes.filter(Boolean).join(' ') }

// Card
export function Card({ className, children }) {
  return <div className={cx('rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900', className)}>{children}</div>
}
export function CardHeader({ className, children }) { return <div className={cx('p-5', className)}>{children}</div> }
export function CardTitle({ className, children }) { return <h3 className={cx('text-base font-semibold text-[#4A2C59]', className)}>{children}</h3> }
export function CardDescription({ className, children }) { return <p className={cx('mt-1 text-sm text-zinc-500 dark:text-zinc-400', className)}>{children}</p> }
export function CardContent({ className, children }) { return <div className={cx('p-5 pt-0', className)}>{children}</div> }

// Badge
export function Badge({ variant = 'default', className, children }) {
  const base = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium'
  const styles = {
    default: 'bg-[#B08CC1] text-white',
    secondary: 'bg-[#52B9C4] text-white',
    outline: 'border border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-200',
    success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    destructive: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
    warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    info: 'bg-[#52B9C4] text-white',
  }
  return <span className={cx(base, styles[variant], className)}>{children}</span>
}

// Button
export function Button({ variant = 'default', size = 'md', className, children, ...props }) {
  const base = 'inline-flex items-center justify-center rounded-xl font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none dark:focus:ring-zinc-700'
  const sizes = { sm: 'h-9 px-3 text-sm', md: 'h-10 px-4 text-sm', lg: 'h-11 px-5 text-base' }
  const variants = {
    default: 'bg-[#4A2C59] text-white hover:bg-[#3A2247] focus:ring-[#B08CC1]',
    primary: 'bg-[#B08CC1] text-white hover:bg-[#9b6dad] focus:ring-[#B08CC1]/40',
    secondary: 'bg-[#52B9C4] text-white hover:bg-[#46a5af] focus:ring-[#52B9C4]/40',
    outline: 'border border-zinc-300 hover:bg-zinc-50 text-[#4A2C59] dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800',
    ghost: 'text-[#4A2C59] hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800',
  }
  return <button className={cx(base, sizes[size], variants[variant], className)} {...props}>{children}</button>
}

// Table
export function Table({ className, children }) {
  return <div className={cx('overflow-x-auto', className)}><table className="min-w-full border-separate border-spacing-y-2">{children}</table></div>
}
export function TableHeader({ children }) { return <thead>{children}</thead> }
export function TableBody({ children }) { return <tbody>{children}</tbody> }
export function TableRow({ className, children, ...rest }) {
  return <tr className={cx('bg-white dark:bg-zinc-900', className)} {...rest}>{children}</tr>
}
export function TableHead({ children }) { return <th className="px-4 py-2 text-left text-xs font-semibold text-zinc-500">{children}</th> }
export function TableCell({ className, children }) { return <td className={cx('px-4 py-3 align-middle text-sm text-zinc-700 dark:text-zinc-200', className)}>{children}</td> }

// Dropdown
function Dropdown({ open, onClose, children }) {
  if (!open) return null
  return (
    <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-900" onClick={onClose}>
      {children}
    </div>
  )
}

// Modal
function Modal({ open, onClose, children, title }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-0 grid place-items-center p-4">
        <div className="w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-[#4A2C59] dark:text-zinc-50">{title}</h3>
            <button onClick={onClose} className="rounded-lg px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">✕</button>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}

// Header
function Header({ onOpenAdd }) {
  const [dark, setDark] = useState(false)
  useEffect(() => { const root = document.documentElement; dark ? root.classList.add('dark') : root.classList.remove('dark') }, [dark])
  const [dd, setDd] = useState(false)
  return (
    <div className="sticky top-0 z-40 mb-6 border-b border-zinc-200 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="mx-auto flex max-w-7xl items-center gap-3 p-4">
        <div className="flex items-center gap-2 text-[#4A2C59] dark:text-zinc-50">
          <a href="/" className="flex items-center gap-2 text-[#4A2C59] dark:text-zinc-50">
            <img src="/TrustDose fi-01.png" alt="TrustDose" className="h-12 w-12 object-contain" />
          </a>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600 md:flex dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            <Search className="h-4 w-4" />
            <input className="w-56 bg-transparent outline-none placeholder:text-zinc-400" placeholder="Search…" />
          </div>
          <div className="relative">
            <Button variant="primary" size="sm" onClick={() => setDd(!dd)}><Plus className="mr-2 h-4 w-4" /> Add</Button>
            
            <Dropdown open={dd} onClose={() => setDd(false)}>
              <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={() => onOpenAdd('Pharmacy')}><Building2 className="h-4 w-4 text-[#52B9C4]"/> Pharmacy</button>
              <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={() => onOpenAdd('Doctor')}><Stethoscope className="h-4 w-4 text-[#52B9C4]"/> Doctor</button>
              <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={() => onOpenAdd('Logistics')}><Truck className="h-4 w-4 text-[#52B9C4]"/> Logistics</button>
            </Dropdown>
          </div>
          <Button variant="ghost" size="sm" aria-label="Notifications"><Bell className="h-5 w-5" /></Button>
          <Button variant="ghost" size="sm" onClick={() => setDark(v => !v)} aria-label="Toggle theme">{dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}</Button>
          <Button variant="outline" size="sm" className="gap-2"><div className="grid h-6 w-6 place-items-center rounded-full bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-100">FT</div><span className="hidden sm:inline">Account</span><ChevronDown className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  )
}

// ===================== Admin Dashboard (JS) =====================
export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('overview')

  const stats = useMemo(() => ([
    { title: 'Total Users', value: '1,284', change: '+12.5%', icon: Users, trend: 'up' },
    { title: 'Active Sessions', value: '342', change: '+5.2%', icon: Activity, trend: 'up' },
    { title: 'System Health', value: '98.5%', change: '+0.3%', icon: TrendingUp, trend: 'up' },
    { title: 'Security Alerts', value: '3', change: '-2', icon: Shield, trend: 'down' },
  ]), [])

  const systemLogs = [
    { id: 1, action: 'User login', user: 'sarah.j@example.com', time: '2 minutes ago', severity: 'info' },
    { id: 2, action: 'Database backup completed', user: 'System', time: '15 minutes ago', severity: 'success' },
    { id: 3, action: 'Failed login attempt', user: 'unknown@example.com', time: '1 hour ago', severity: 'warning' },
    { id: 4, action: 'Settings updated', user: 'admin@example.com', time: '2 hours ago', severity: 'info' },
  ]

  const [users] = useState([
    { id: 1, name: 'Sarah Johnson', email: 'sarah.j@example.com', role: 'Admin', status: 'Active', joined: '2024-03-15' },
    { id: 2, name: 'Mike Chen', email: 'mike.c@example.com', role: 'User', status: 'Active', joined: '2024-03-14' },
    { id: 3, name: 'Emma Wilson', email: 'emma.w@example.com', role: 'Moderator', status: 'Active', joined: '2024-03-13' },
  ])

  const [pharmacies, setPharmacies] = useState([
    { id: 101, name: 'Riyadh Central Pharmacy', license: 'PH-0192', city: 'Riyadh', status: 'Active' },
    { id: 102, name: 'North Gate Pharmacy', license: 'PH-0220', city: 'Jeddah', status: 'Pending' },
  ])
  const [doctors, setDoctors] = useState([
    { id: 201, name: 'Dr. Aisha Al-Qahtani', specialty: 'Cardiology', regId: 'MOH-8812', status: 'Active' },
    { id: 202, name: 'Dr. Omar Al-Harbi', specialty: 'Endocrinology', regId: 'MOH-7721', status: 'Suspended' },
  ])
  const [logistics, setLogistics] = useState([
    { id: 301, company: 'MedExpress', contact: 'ops@medexpress.com', sla: '2h @ 2–8°C', active: true },
    { id: 302, company: 'HealthGo', contact: 'fleet@healthgo.com', sla: '3h @ 2–8°C', active: true },
  ])

  const [shipments] = useState([
    { id: 'SHP-88412', rxId: 'RX-983112', drug: 'Insulin Glargine', from: 'Riyadh Central Pharmacy', to: 'Patient #10212', carrier: 'MedExpress', tempMin: 2, tempMax: 8, lastTemp: 5.2, status: 'In Transit', progress: 62, updated: '2m ago' },
    { id: 'SHP-88433', rxId: 'RX-983224', drug: 'Vacc. MMR', from: 'North Gate Pharmacy', to: 'Patient #10388', carrier: 'HealthGo', tempMin: 2, tempMax: 8, lastTemp: 12.9, status: 'Breach', progress: 41, updated: '8m ago' },
    { id: 'SHP-88457', rxId: 'RX-983311', drug: 'Erythropoietin', from: 'Riyadh Central Pharmacy', to: 'Patient #10401', carrier: 'MedExpress', tempMin: 2, tempMax: 8, lastTemp: 4.1, status: 'Delivered', progress: 100, updated: '10m ago' },
  ])

  const shipmentEvents = {
    'SHP-88412': [
      { time: '2025-09-30 14:10', location: 'Warehouse Riyadh', temp: 5.0, status: 'Packed' },
      { time: '2025-09-30 15:40', location: 'Truck #22', temp: 6.1, status: 'Departed' },
      { time: '2025-09-30 18:15', location: 'Checkpoint North', temp: 6.8, status: 'In Transit' },
      { time: '2025-09-30 20:10', location: 'Ring Road Exit', temp: 5.9, status: 'In Transit' },
    ],
    'SHP-88433': [
      { time: '2025-09-30 14:20', location: 'Warehouse Jeddah', temp: 7.5, status: 'Packed' },
      { time: '2025-09-30 16:00', location: 'Truck #5', temp: 9.2, status: 'Departed' },
      { time: '2025-09-30 18:30', location: 'Highway Checkpoint', temp: 12.9, status: 'Breach detected' },
    ],
    'SHP-88457': [
      { time: '2025-09-30 09:10', location: 'Warehouse Riyadh', temp: 4.8, status: 'Packed' },
      { time: '2025-09-30 10:30', location: 'Truck #19', temp: 5.2, status: 'Departed' },
      { time: '2025-09-30 12:10', location: 'City Center', temp: 4.9, status: 'Delivered' },
    ],
  }
  const [selectedShipment, setSelectedShipment] = useState(null)

  const [isAddOpen, setIsAddOpen] = useState(false)
  function genAccessId(){ return 'AC-' + Math.random().toString(36).slice(2,8).toUpperCase() }
  const [entityType, setEntityType] = useState('Doctor')
  const [form, setForm] = useState({ name: '', email: '', role: 'User', status: 'Active', license: '', city: '', specialty: '', regId: '', company: '', contact: '', sla: '2h @ 2–8°C', accessId: genAccessId() })
  const resetForm = () => setForm({ name: '', email: '', role: 'User', status: 'Active', license: '', city: '', specialty: '', regId: '', company: '', contact: '', sla: '2h @ 2–8°C', accessId: genAccessId() })

  const onSubmitAdd = (e) => {
    e.preventDefault()
    if (entityType === 'Pharmacy') {
      const id = pharmacies.length ? Math.max(...pharmacies.map(p => p.id)) + 1 : 100
      setPharmacies([{ id, name: form.name, license: form.license, city: form.city, status: 'Pending', accessId: form.accessId }, ...pharmacies])
      setActiveTab('pharmacies')
    } else if (entityType === 'Doctor') {
      const id = doctors.length ? Math.max(...doctors.map(d => d.id)) + 1 : 200
      setDoctors([{ id, name: form.name, specialty: form.specialty, regId: form.regId, status: 'Active', accessId: form.accessId }, ...doctors])
      setActiveTab('doctors')
    } else if (entityType === 'Logistics') {
      const id = logistics.length ? Math.max(...logistics.map(l => l.id)) + 1 : 300
      setLogistics([{ id, company: form.company, contact: form.contact, sla: form.sla, active: true, accessId: form.accessId }, ...logistics])
      setActiveTab('logistics')
    }
    resetForm(); setIsAddOpen(false)
  }

  return (
    <div className="min-h-screen bg-white">
      <Header onOpenAdd={(type) => { setEntityType(type); setIsAddOpen(true); }} />

      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#4A2C59] md:text-3xl">Admin Console</h1>
            <p className="mt-1 text-sm text-zinc-500 md:text-base">Manage identities & compliance, and monitor medicine transfers</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm"><FileText className="mr-2 h-4 w-4" />Export</Button>
            <Button variant="primary" size="sm"><Settings className="mr-2 h-4 w-4" />Settings</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-4">
          {stats.map((stat, i) => (
            <Card key={i} className="border">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm">{stat.title}</CardTitle>
                <stat.icon className="h-4 w-4 text-[#52B9C4]" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-[#4A2C59]">{stat.value}</div>
                <div className="mt-1 flex items-center gap-2">
                  <Badge variant={stat.trend==='up'?'success':'warning'}>{stat.change}</Badge>
                  <p className="text-xs text-zinc-500">from last month</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 border-b border-zinc-200">
          {[
            ['overview','Overview'],['users','Users'],['pharmacies','Pharmacies'],['doctors','Doctors'],['logistics','Logistics'],['shipments','Shipments'],['logs','System Logs'],['alerts','Alerts'],['reports','Reports']
          ].map(([key,label]) => (
            <Button key={key} variant={activeTab===key?'primary':'ghost'} onClick={()=>setActiveTab(key)} className="rounded-b-none">{label}</Button>
          ))}
        </div>

        {activeTab==='users' && (
          <Card>
            <CardHeader><CardTitle>Users</CardTitle><CardDescription>Accounts & roles</CardDescription></CardHeader>
            <CardContent>
              <div className="mb-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600"><Search className="h-4 w-4" /><input className="w-56 bg-transparent outline-none placeholder:text-zinc-400" placeholder="Search users…" /></div>
                <div className="flex gap-2">
                  <Button size="sm" variant="primary" onClick={()=>{setEntityType('Doctor'); setIsAddOpen(true)}}><Plus className="mr-2 h-4 w-4"/>Add Doctor</Button>
                  <Button size="sm" variant="outline" onClick={()=>{setEntityType('Pharmacy'); setIsAddOpen(true)}}><Plus className="mr-2 h-4 w-4"/>Add Pharmacy</Button>
                  <Button size="sm" variant="outline" onClick={()=>{setEntityType('Logistics'); setIsAddOpen(true)}}><Plus className="mr-2 h-4 w-4"/>Add Logistics</Button>
                </div>
              </div>
              <Table>
                <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead>Joined</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                <TableBody>
                  {users.map(u => (
                    <TableRow key={u.id}><TableCell className="font-medium">{u.name}</TableCell><TableCell>{u.email}</TableCell><TableCell><Badge variant="secondary">{u.role}</Badge></TableCell><TableCell><Badge variant={u.status==='Active'?'success':'outline'}>{u.status}</Badge></TableCell><TableCell className="text-zinc-500">{u.joined}</TableCell><TableCell><div className="flex gap-2"><Button size="sm" variant="ghost">Edit</Button><Button size="sm" variant="ghost">Delete</Button></div></TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {activeTab==='pharmacies' && (
          <Card>
            <CardHeader><div className="flex items-center gap-2"><Building2 className="h-5 w-5 text-[#52B9C4]"/><CardTitle>Pharmacies</CardTitle></div><CardDescription>Licensing & status</CardDescription></CardHeader>
            <CardContent>
              <div className="mb-4 flex justify-end"><Button size="sm" variant="primary" onClick={()=>{setEntityType('Pharmacy'); setIsAddOpen(true)}}><Plus className="mr-2 h-4 w-4"/>Add Pharmacy</Button></div>
              <Table>
                <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>License</TableHead><TableHead>City</TableHead><TableHead>Access ID</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                <TableBody>
                  {pharmacies.map(p => (
                    <TableRow key={p.id}><TableCell className="font-medium">{p.name}</TableCell><TableCell>{p.license}</TableCell><TableCell>{p.city}</TableCell><TableCell className="font-mono text-xs">{p.accessId}</TableCell><TableCell><Badge variant={p.status==='Active'?'success':p.status==='Pending'?'warning':'outline'}>{p.status}</Badge></TableCell><TableCell><div className="flex gap-2"><Button size="sm" variant="ghost">View</Button><Button size="sm" variant="ghost">Suspend</Button></div></TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {activeTab==='doctors' && (
          <Card>
            <CardHeader><div className="flex items-center gap-2"><Stethoscope className="h-5 w-5 text-[#52B9C4]"/><CardTitle>Doctors</CardTitle></div><CardDescription>Registration & practice</CardDescription></CardHeader>
            <CardContent>
              <div className="mb-4 flex justify-end"><Button size="sm" variant="primary" onClick={()=>{setEntityType('Doctor'); setIsAddOpen(true)}}><Plus className="mr-2 h-4 w-4"/>Add Doctor</Button></div>
              <Table>
                <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Specialty</TableHead><TableHead>MOH Reg</TableHead><TableHead>Access ID</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                <TableBody>
                  {doctors.map(d => (
                    <TableRow key={d.id}><TableCell className="font-medium">{d.name}</TableCell><TableCell>{d.specialty}</TableCell><TableCell>{d.regId}</TableCell><TableCell className="font-mono text-xs">{d.accessId}</TableCell><TableCell><Badge variant={d.status==='Active'?'success':d.status==='Suspended'?'destructive':'outline'}>{d.status}</Badge></TableCell><TableCell><div className="flex gap-2"><Button size="sm" variant="ghost">View</Button><Button size="sm" variant="ghost">Suspend</Button></div></TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {activeTab==='logistics' && (
          <Card>
            <CardHeader><div className="flex items-center gap-2"><Truck className="h-5 w-5 text-[#52B9C4]"/><CardTitle>Logistics Partners</CardTitle></div><CardDescription>Fleet & SLA</CardDescription></CardHeader>
            <CardContent>
              <div className="mb-4 flex justify-end"><Button size="sm" variant="primary" onClick={()=>{setEntityType('Logistics'); setIsAddOpen(true)}}><Plus className="mr-2 h-4 w-4"/>Add Partner</Button></div>
              <Table>
                <TableHeader><TableRow><TableHead>Company</TableHead><TableHead>Contact</TableHead><TableHead>SLA</TableHead><TableHead>Access ID</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {logistics.map(l => (
                    <TableRow key={l.id}><TableCell className="font-medium">{l.company}</TableCell><TableCell>{l.contact}</TableCell><TableCell>{l.sla}</TableCell><TableCell className="font-mono text-xs">{l.accessId}</TableCell><TableCell><Badge variant={l.active?'success':'outline'}>{l.active?'Active':'Inactive'}</Badge></TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {activeTab==='shipments' && (
          <Card>
            <CardHeader><div className="flex items-center gap-2"><Thermometer className="h-5 w-5 text-[#52B9C4]"/><CardTitle>Medicine Shipments</CardTitle></div><CardDescription>Track per-prescription transfers and temperature</CardDescription></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Shipment</TableHead><TableHead>RX / Drug</TableHead><TableHead>Route</TableHead><TableHead>Carrier</TableHead><TableHead>Temp (°C)</TableHead><TableHead>Status</TableHead><TableHead>Progress</TableHead></TableRow></TableHeader>
                <TableBody>
                  {shipments.map(s => (
                    <TableRow key={s.id} onClick={() => setSelectedShipment(s)} className="cursor-pointer hover:bg-zinc-50">
                      <TableCell className="font-medium">{s.id}</TableCell>
                      <TableCell><span className="font-medium">{s.rxId}</span> — {s.drug}</TableCell>
                      <TableCell>{s.from} <ChevronRight className="mx-1 inline h-4 w-4 align-middle text-[#52B9C4]"/> {s.to}</TableCell>
                      <TableCell>{s.carrier}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2"><Badge variant={s.lastTemp> s.tempMax || s.lastTemp < s.tempMin ? 'destructive':'success'}>{s.lastTemp.toFixed(1)}°</Badge><span className="text-xs text-zinc-500">range {s.tempMin}–{s.tempMax}°</span></div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={s.status==='Breach'?'destructive':s.status==='Delivered'?'success':s.status==='In Transit'?'info':'outline'}>{s.status}</Badge>
                        <div className="text-xs text-zinc-500">{s.updated}</div>
                      </TableCell>
                      <TableCell>
                        <div className="h-2 w-40 overflow-hidden rounded-full bg-zinc-200">
                          <div
                            className={cx('h-full',
                              s.status==='Breach' ? 'bg-rose-500' :
                              s.status==='Delivered' ? 'bg-emerald-500' :
                              'bg-[#B08CC1]'
                            )}
                            style={{width: `${s.progress}%`}}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {activeTab==='logs' && (
          <Card>
            <CardHeader><CardTitle>System Logs</CardTitle><CardDescription>Monitor system events and security alerts</CardDescription></CardHeader>
            <CardContent>
              <div className="mb-3 flex items-center gap-2 text-sm"><Filter className="h-4 w-4 text-[#52B9C4]" /><span className="text-zinc-500">Filter by severity, date, user (coming soon)</span></div>
              <div className="space-y-3">
                {systemLogs.map(log => (
                  <div key={log.id} className="flex items-center justify-between rounded-xl border border-zinc-200 p-4 transition-colors hover:bg-zinc-50">
                    <div className="flex items-center gap-3">
                      <AlertCircle className={cx('h-5 w-5',
                        log.severity === 'warning' ? 'text-amber-500' :
                        log.severity === 'success' ? 'text-emerald-500' :
                        'text-[#B08CC1]'
                      )} />
                      <div><p className="font-medium text-[#4A2C59]">{log.action}</p><p className="text-sm text-zinc-500">{log.user}</p></div>
                    </div>
                    <div className="text-right"><Badge variant="outline" className="text-xs capitalize">{log.severity}</Badge><p className="mt-1 text-xs text-zinc-500">{log.time}</p></div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab==='alerts' && (
          <Card>
            <CardHeader><div className="flex items-center gap-2"><Shield className="h-5 w-5 text-[#52B9C4]"/><CardTitle>Alerts</CardTitle></div><CardDescription>Security & cold-chain alerts</CardDescription></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[{id:1, level:'High', type:'Temperature', msg:'Cold-chain breach on RX-983224'}, {id:2, level:'Medium', type:'Auth', msg:'5 failed login attempts (pharmacy-ops)'}].map(a => (
                  <div key={a.id} className="flex items-center justify-between rounded-xl border border-zinc-200 p-4">
                    <div className="flex items-center gap-3"><Badge variant={a.level==='High'?'destructive':'warning'}>{a.level}</Badge><div><p className="font-medium text-[#4A2C59]">{a.type}</p><p className="text-sm text-zinc-500">{a.msg}</p></div></div>
                    <Button size="sm" variant="ghost">Acknowledge</Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab==='reports' && (
          <Card>
            <CardHeader><CardTitle>Reports</CardTitle><CardDescription>Generate & export datasets</CardDescription></CardHeader>
            <CardContent>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Button variant="primary" size="sm"><Download className="mr-2 h-4 w-4" /> Export Users CSV</Button>
                <Button variant="outline" size="sm"><FileText className="mr-2 h-4 w-4" /> Prescriptions PDF</Button>
                <Button variant="outline" size="sm"><ClipboardList className="mr-2 h-4 w-4" /> Monthly Summary</Button>
              </div>
              <p className="text-sm text-zinc-600">(Placeholder) Wire these to Firestore/Chain later.</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Add-Entity Modal */}
      <Modal open={isAddOpen} onClose={()=>setIsAddOpen(false)} title={`Add ${entityType}`}>
        <form onSubmit={onSubmitAdd} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-[#4A2C59]">Entity type</label>
              <select value={entityType} onChange={e=>setEntityType(e.target.value)} className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-[#4A2C59] outline-none focus:ring-2 focus:ring-[#B08CC1]/40">
                <option>Doctor</option>
                <option>Pharmacy</option>
                <option>Logistics</option>
              </select>
            </div>
            <div/>
          </div>

          {entityType==='Pharmacy' && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div><label className="mb-1 block text-sm font-medium text-[#4A2C59]">Name</label><input required value={form.name} onChange={e=>setForm({...form, name:e.target.value})} className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-[#4A2C59] outline-none focus:ring-2 focus:ring-[#B08CC1]/40" /></div>
              <div><label className="mb-1 block text-sm font-medium text-[#4A2C59]">License</label><input required value={form.license} onChange={e=>setForm({...form, license:e.target.value})} className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-[#4A2C59] outline-none focus:ring-2 focus:ring-[#B08CC1]/40" /></div>
              <div><label className="mb-1 block text-sm font-medium text-[#4A2C59]">City</label><input required value={form.city} onChange={e=>setForm({...form, city:e.target.value})} className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-[#4A2C59] outline-none focus:ring-2 focus:ring-[#B08CC1]/40" /></div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-[#4A2C59]">Access ID</label>
                <div className="flex gap-2">
                  <input readOnly value={form.accessId} className="w-full rounded-xl border border-zinc-300 bg-zinc-100 px-3 py-2 text-[#4A2C59]" />
                  <Button type="button" variant="outline" onClick={() => setForm(f=>({...f, accessId: genAccessId()}))}>Regenerate</Button>
                </div>
              </div>
            </div>
          )}

          {entityType==='Doctor' && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div><label className="mb-1 block text-sm font-medium text-[#4A2C59]">Name</label><input required value={form.name} onChange={e=>setForm({...form, name:e.target.value})} className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-[#4A2C59] outline-none focus:ring-2 focus:ring-[#B08CC1]/40" /></div>
              <div><label className="mb-1 block text-sm font-medium text-[#4A2C59]">Specialty</label><input required value={form.specialty} onChange={e=>setForm({...form, specialty:e.target.value})} className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-[#4A2C59] outline-none focus:ring-2 focus:ring-[#B08CC1]/40" /></div>
              <div><label className="mb-1 block text-sm font-medium text-[#4A2C59]">MOH Reg</label><input required value={form.regId} onChange={e=>setForm({...form, regId:e.target.value})} className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-[#4A2C59] outline-none focus:ring-2 focus:ring-[#B08CC1]/40" /></div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-[#4A2C59]">Access ID</label>
                <div className="flex gap-2">
                  <input readOnly value={form.accessId} className="w-full rounded-xl border border-zinc-300 bg-zinc-100 px-3 py-2 text-[#4A2C59]" />
                  <Button type="button" variant="outline" onClick={() => setForm(f=>({...f, accessId: genAccessId()}))}>Regenerate</Button>
                </div>
              </div>
            </div>
          )}

          {entityType==='Logistics' && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div><label className="mb-1 block text-sm font-medium text-[#4A2C59]">Company</label><input required value={form.company} onChange={e=>setForm({...form, company:e.target.value})} className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-[#4A2C59] outline-none focus:ring-2 focus:ring-[#B08CC1]/40" /></div>
              <div><label className="mb-1 block text-sm font-medium text-[#4A2C59]">Contact</label><input required value={form.contact} onChange={e=>setForm({...form, contact:e.target.value})} className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-[#4A2C59] outline-none focus:ring-2 focus:ring-[#B08CC1]/40" /></div>
              <div className="md:col-span-2"><label className="mb-1 block text-sm font-medium text-[#4A2C59]">SLA</label><input required value={form.sla} onChange={e=>setForm({...form, sla:e.target.value})} className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-[#4A2C59] outline-none focus:ring-2 focus:ring-[#B08CC1]/40" /></div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-[#4A2C59]">Access ID</label>
                <div className="flex gap-2">
                  <input readOnly value={form.accessId} className="w-full rounded-xl border border-zinc-300 bg-zinc-100 px-3 py-2 text-[#4A2C59]" />
                  <Button type="button" variant="outline" onClick={() => setForm(f=>({...f, accessId: genAccessId()}))}>Regenerate</Button>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={()=>setIsAddOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary">Save</Button>
          </div>
        </form>
      </Modal>

      {/* Shipment Details Modal */}
      <Modal open={!!selectedShipment} onClose={()=>setSelectedShipment(null)} title={`Shipment ${selectedShipment?.id ?? ''} — ${selectedShipment?.rxId ?? ''}`}>
        {selectedShipment && (
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="text-sm text-zinc-600">
                <div><span className="font-medium text-[#4A2C59]">Drug:</span> {selectedShipment.drug}</div>
                <div><span className="font-medium text-[#4A2C59]">Carrier:</span> {selectedShipment.carrier}</div>
                <div><span className="font-medium text-[#4A2C59]">Route:</span> {selectedShipment.from} → {selectedShipment.to}</div>
              </div>
              <div className="text-sm text-zinc-600">
                <div className="mb-1">Temperature</div>
                <div className="flex items-center gap-2">
                  <Badge variant={selectedShipment.lastTemp> selectedShipment.tempMax || selectedShipment.lastTemp < selectedShipment.tempMin ? 'destructive' : 'success'}>
                    {selectedShipment.lastTemp.toFixed(1)}°C
                  </Badge>
                  <span className="text-xs text-zinc-500">Range {selectedShipment.tempMin}–{selectedShipment.tempMax}°C</span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-200">
                  <div className={cx('h-full', selectedShipment.status==='Breach'?'bg-rose-500':selectedShipment.status==='Delivered'?'bg-emerald-500':'bg-[#B08CC1]')} style={{width: `${selectedShipment.progress}%`}}></div>
                </div>
                <div className="mt-1 text-xs text-zinc-500">Status: {selectedShipment.status} • {selectedShipment.updated}</div>
              </div>
            </div>

            <div>
              <div className="mb-2 text-sm font-medium text-[#4A2C59]">Timeline</div>
              <div className="border-l-2 border-[#B08CC1] pl-4">
                {(shipmentEvents[selectedShipment.id] || []).map((e, idx) => {
                  const outOfRange = e.temp > selectedShipment.tempMax || e.temp < selectedShipment.tempMin
                  return (
                    <div key={idx} className="mb-4">
                      <p className="text-xs text-zinc-500">{e.time} — {e.location}</p>
                      <p className="text-sm font-medium text-[#4A2C59]">
                        {e.status}
                        <span className={cx('ml-2', outOfRange ? 'text-rose-600' : 'text-[#B08CC1]')}>{e.temp.toFixed(1)}°C</span>
                      </p>
                    </div>
                  )
                })}
                {(!shipmentEvents[selectedShipment.id] || shipmentEvents[selectedShipment.id].length===0) && (
                  <p className="text-sm text-zinc-500">No events yet.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}


