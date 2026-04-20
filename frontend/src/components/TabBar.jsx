import './TabBar.css';

export default function TabBar({ tabs, activeTab, onTabChange }) {
  return (
    <div className="tabbar" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={activeTab === tab.id}
          className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          <span className="tab-label">{tab.label}</span>
          {tab.badge != null && (
            <span className={`tab-badge ${tab.badgeColor || ''}`}>{tab.badge}</span>
          )}
          {activeTab === tab.id && <span className="tab-indicator" />}
        </button>
      ))}
    </div>
  );
}
