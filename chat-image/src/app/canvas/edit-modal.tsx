import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface EditModalProps {
  open: boolean;
  onClose: () => void;
}

export function EditModal({ open, onClose }: EditModalProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>功能已下线</DialogTitle>
          <DialogDescription>
            当前版本仅保留统一图片生成接口。带图生成会通过 reference_images 作为参考图提交，不再提供遮罩或局部编辑工作流。
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
