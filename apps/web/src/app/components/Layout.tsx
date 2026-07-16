import { Outlet, useLocation, useNavigate } from "react-router";
import { Home, GitBranch, Cake, Clock, User } from "lucide-react";
import { useFamily } from "../context/FamilyContext";

export default function Layout() {
  const { snapshot } = useFamily();
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = [
    { path: "/", icon: Home, label: "首页" },
    { path: "/tree", icon: GitBranch, label: "图谱" },
    { path: "/birthday", icon: Cake, label: "生日" },
    { path: "/timeline", icon: Clock, label: "时间轴" },
    { path: "/profile", icon: User, label: "我的" },
  ];

  const NavButton = ({ item, vertical = false }: { item: typeof navItems[0]; vertical?: boolean }) => {
    const Icon = item.icon;
    const isActive = location.pathname === item.path;
    return (
      <button
        onClick={() => navigate(item.path)}
        className={`flex items-center gap-3 rounded-xl transition-all ${
          vertical
            ? `w-full px-4 py-3 ${isActive ? "bg-[#d4756a]/10 text-[#d4756a]" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}`
            : `flex-col justify-center gap-1 px-4 py-2 ${isActive ? "text-[#d4756a]" : "text-gray-500 hover:text-gray-700"}`
        }`}
      >
        <Icon className="w-5 h-5 flex-shrink-0" strokeWidth={isActive ? 2.5 : 2} />
        <span className={vertical ? "text-sm font-medium" : "text-xs"}>{item.label}</span>
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#faf8f5] to-[#f5f0eb]">
      {/* Sidebar — desktop only */}
      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-56 bg-white border-r border-gray-100 shadow-sm flex-col z-30">
        <div className="px-6 py-6 border-b border-gray-100">
          <h1 className="text-lg font-semibold truncate" style={{ color: '#3d2f2a' }}>🌿 {snapshot?.family.name}</h1>
          <p className="text-xs text-gray-500 mt-1">记录家人，珍藏温暖</p>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map(item => <NavButton key={item.path} item={item} vertical />)}
        </nav>
        <div className="px-6 py-4 border-t border-gray-100">
          <p className="text-xs text-gray-400">小家记网页版</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="md:pl-56 min-h-screen pb-16 md:pb-0">
        <Outlet />
      </main>

      {/* Bottom Navigation — mobile only */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-30">
        <div className="flex justify-around items-center h-16 px-2">
          {navItems.map(item => <NavButton key={item.path} item={item} />)}
        </div>
      </nav>
    </div>
  );
}
