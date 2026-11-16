package example.escrow;

public class BusinessError extends RuntimeException {
  public final int status;
  public final String code;

  public BusinessError(int status, String code, String detail) {
    super(detail);
    this.status = status;
    this.code = code;
  }

  public static void require(boolean condition, String detail) {
    if (!condition) throw new BusinessError(422, "PRECONDITION_FAILED", detail);
  }

  public static BusinessError invalid(String detail) {
    return new BusinessError(422, "INVALID_INPUT", detail);
  }
}
