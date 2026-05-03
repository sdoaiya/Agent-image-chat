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
          <DialogTitle>请在工作台上传参考图</DialogTitle>
          <DialogDescription>
            带图生成会由本地服务转换为上游 images/edits 请求，不再提供遮罩或局部编辑工作流。
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          直接在工作台上传参考图并输入修改提示词即可，后端会按图片编辑接口提交 multipart 表单。
        </div>
        <DialogFooter>
          <Button onClick={onClose}>我知道了</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
