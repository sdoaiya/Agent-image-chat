import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface EditModalProps {
  open: boolean;
  onClose: () => void;
  imageUrl?: string;
  initialPrompt?: string;
  onSubmit?: (maskFile: File, prompt: string) => void;
}

export function EditModal({ open, onClose }: EditModalProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>功能已下线</DialogTitle>
          <DialogDescription>
            带图生成会通过 reference_images 作为参考图提交，不再提供遮罩或局部编辑工作流。
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          当前版本统一走 <code>POST /v1/images/generations</code>，建议直接在工作台上传参考图并输入修改提示词。
        </div>
        <DialogFooter>
          <Button onClick={onClose}>我知道了</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
