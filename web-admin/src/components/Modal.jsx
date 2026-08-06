const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        backgroundColor: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "12px",
          width: "90%",
          height: "90%",
          maxWidth: "500px",
          padding: "1.5rem",
          boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
          position: "relative",
          overflowY: "auto",
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: "12px",
            right: "12px",
            background: "none",
            border: "none",
            fontSize: "1.25rem",
            cursor: "pointer",
            color: "#6B7280",
          }}
        >
          ✕
        </button>
        <h3 style={{ marginBottom: "1rem", color: "var(--text-main)" }}>
          {title}
        </h3>
        {children}
      </div>
    </div>
  );
};

export default Modal;
