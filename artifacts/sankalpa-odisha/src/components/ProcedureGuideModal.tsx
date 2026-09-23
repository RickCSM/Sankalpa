import ManualGuide from './manual/ManualGuide';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function ProcedureGuideModal({ isOpen, onClose }: Props) {
  return <ManualGuide isOpen={isOpen} onClose={onClose} />;
}
