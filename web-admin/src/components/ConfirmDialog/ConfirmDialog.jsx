import { AlertTriangle, X } from "lucide-react";
import "./ConfirmDialog.css";

const ConfirmDialog = ({
    open,
    title = "Delete this item?",
    message,
    confirmLabel = "Delete",
    cancelLabel = "Cancel",
    onConfirm,
    onCancel,
}) => {
    if (!open) return null;

    return (
        <div className="cd-overlay" onClick={onCancel}>
            <div className="cd-card" onClick={(e) => e.stopPropagation()}>
                <button className="cd-close" onClick={onCancel} aria-label="Close">
                    <X size={16} />
                </button>

                <div className="cd-icon-wrap">
                    <AlertTriangle size={22} />
                </div>

                <h3 className="cd-title">{title}</h3>
                {message && <p className="cd-message">{message}</p>}

                <div className="cd-actions">
                    <button className="cd-btn cd-btn--cancel" onClick={onCancel}>
                        {cancelLabel}
                    </button>
                    <button className="cd-btn cd-btn--confirm" onClick={onConfirm}>
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmDialog;
